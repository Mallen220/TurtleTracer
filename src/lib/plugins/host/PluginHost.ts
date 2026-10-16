// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Runs the user's plugins: lists them, turns them on and off (asking for
// consent and installing packages where needed), starts and stops them, and
// keeps the running ones told about the project, playback and selection.
// It's what the plugin manager shows.
import { get, writable } from "svelte/store";
import debounce from "lodash/debounce";
import throttle from "lodash/throttle";
import type {
  FormField,
  FormValues,
  PickedProject,
  Plan,
  ProjectSnapshot,
} from "../api";
import type {
  PluginListing,
  PluginManifest,
  PluginPermission,
  PluginRecord,
  PluginsBridge,
} from "../protocol/ipc";
import { getElectronAPI } from "../../../utils/platform";
import {
  percentStore,
  playingStore,
  timePredictionStore,
} from "../../projectStore";
import { notification, selectedLineId, selectedPointId } from "../../../stores";
import { hookRegistry, markerTypeRegistry } from "../../registries";
import { defaultsFor } from "../../actions/PluginStepAction";
import { appBridge, type AppBridge } from "../bridge";
import { analyzeProject } from "./analyze";
import { askConsent, grantFor, needsConsent } from "./consent";
import { dialogsFor } from "./dialogs";
import { resolveMarkers } from "./markerResolver";
import { currentPlan, projectChanges, readProjectState } from "./project";
import { RunningPlugin } from "./RunningPlugin";
import {
  check,
  formFieldsSchema,
  jsonSchema,
  pickedProjectSchema,
} from "./schemas";
import type { PluginServices } from "./services";
import { buildSnapshot } from "./snapshot";
import { postToViews, registerViews } from "./views";
import type { RuntimeInit } from "../protocol/runtime";
import { connectToFrame, createHiddenFrame, pluginUrl } from "./sandbox";

export type PluginStatus =
  | "off"
  | "starting"
  | "installing"
  | "running"
  | "failed"
  | "paused"
  | "unresponsive"
  | "needs-consent"
  | "invalid"
  | "legacy";

/** One plugin, as the plugin manager shows it. */
export interface PluginEntry {
  id: string;
  name: string;
  manifest?: PluginManifest;
  enabled: boolean;
  status: PluginStatus;
  /** Why it isn't running, when that's not obvious. */
  problem?: string;
  /** Recent errors and console output, oldest first. */
  log: LogLine[];
  settingsFields: FormField[];
  settings: FormValues;
  permissions: PluginPermission[];
  dependencies: Record<string, string>;
  dependenciesInstalled: boolean;
}

/** A line in a plugin's log. Errors are the app's; the rest is the plugin's console. */
export interface LogLine {
  level: "error" | "warn" | "info";
  text: string;
}

/** How many log lines are kept for each plugin. */
const LOG_SIZE = 50;
/** How long plugins must have been starting, without a crash, to count as started. */
const BOOT_GRACE_MS = 10_000;

function bridge(): PluginsBridge {
  const plugins = getElectronAPI({ allowVirtual: false })?.plugins;
  if (!plugins) throw new Error("Plugins need the desktop app.");
  return plugins;
}

const TONES = ["info", "success", "warning", "error"] as const;

class PluginHost implements PluginServices {
  /** Every plugin in the plugins folder, for the plugin manager. */
  readonly entries = writable<PluginEntry[]>([]);
  /** The app was started with --safe-mode: no plugins run. */
  readonly safeMode = writable(false);
  readonly running = new Map<string, RunningPlugin>();
  /** Plugins part way through starting (downloading packages, say). */
  #starting = new Set<string>();

  #listings = new Map<string, PluginListing>();
  #records: Record<string, PluginRecord> = {};
  #status = new Map<string, { status: PluginStatus; problem?: string }>();
  #logs = new Map<string, LogLine[]>();
  #lastToast = new Map<string, number>();
  #frames: HTMLElement | null = null;
  #stopWatching: (() => void) | null = null;

  // --- The list ---

  /** Reads the plugins folder again. */
  async refresh() {
    const { plugins, records, safeMode, crashedDuringBoot } =
      await bridge().list();
    this.#listings = new Map(plugins.map((p) => [p.id, p]));
    this.#records = records;
    this.safeMode.set(safeMode);
    this.#publish();
    return { safeMode, crashedDuringBoot };
  }

  #settingsFields(manifest: PluginManifest | undefined): FormField[] {
    if (!manifest?.settings?.length) return [];
    return check(
      formFieldsSchema,
      manifest.settings,
      "settings in plugin.json",
    );
  }

  #publish() {
    const entries: PluginEntry[] = [];
    for (const listing of this.#listings.values()) {
      const manifest = listing.manifest;
      const record = this.#records[listing.id] ?? {};
      let settingsFields: FormField[] = [];
      let problem = listing.error;
      try {
        settingsFields = this.#settingsFields(manifest);
      } catch (error) {
        problem = (error as Error).message;
      }
      const known = this.#status.get(listing.id);
      let status: PluginStatus = known?.status ?? "off";
      if (listing.legacy) status = "legacy";
      else if (problem && !manifest) status = "invalid";
      entries.push({
        id: listing.id,
        name: manifest?.name ?? listing.id,
        manifest,
        enabled: record.enabled === true,
        status,
        problem: known?.problem ?? problem,
        log: this.#logs.get(listing.id) ?? [],
        settingsFields,
        settings: { ...defaultsFor(settingsFields), ...record.settings },
        permissions: manifest?.permissions ?? [],
        dependencies: manifest?.dependencies ?? {},
        dependenciesInstalled: listing.dependenciesInstalled ?? true,
      });
    }
    this.entries.set(entries.sort((a, b) => a.name.localeCompare(b.name)));
  }

  #setStatus(id: string, status: PluginStatus, problem?: string) {
    this.#status.set(id, { status, problem });
    this.#publish();
  }

  // --- Starting and stopping ---

  /** Starts every plugin that's on. Called once at startup. */
  async startEnabled() {
    const { safeMode, crashedDuringBoot } = await this.refresh();
    if (safeMode) return;
    if (crashedDuringBoot) {
      notification.set({
        message:
          "Plugins weren't started: Turtle Tracer closed while starting them last time.",
        type: "warning",
        timeout: 0,
        actionLabel: "Start them",
        action: () => void this.#startAll(),
      });
      return;
    }
    await this.#startAll();
  }

  async #startAll() {
    const plugins = bridge();
    // A flag that's still there next launch means the app crashed or hung
    // while plugins were starting. Surviving a few seconds is enough to clear
    // it, even if a plugin is still downloading its packages.
    await plugins.boot("start");
    const ids = [...this.#listings.keys()].filter(
      (id) => this.#records[id]?.enabled,
    );
    const started = Promise.all(ids.map((id) => this.#start(id, false)));
    await Promise.race([
      started,
      new Promise((r) => setTimeout(r, BOOT_GRACE_MS)),
    ]);
    await plugins.boot("done");
    await started;
  }

  /**
   * Starts one plugin that's on. `asked` says whether the user just agreed
   * to what it needs; at startup nobody is asked, so a plugin that wants
   * something new waits until the user turns it on again.
   */
  async #start(id: string, asked: boolean) {
    const listing = this.#listings.get(id);
    const manifest = listing?.manifest;
    if (!manifest || this.running.has(id) || this.#starting.has(id)) return;
    try {
      this.#settingsFields(manifest);
    } catch (error) {
      this.#setStatus(id, "failed", (error as Error).message);
      return;
    }
    if (
      !asked &&
      needsConsent(manifest) &&
      this.#records[id]?.grant !== grantFor(manifest)
    ) {
      this.#setStatus(
        id,
        "needs-consent",
        "This version asks for something new. Turn it on again to see what.",
      );
      return;
    }

    this.#starting.add(id);
    try {
      if (!listing.dependenciesInstalled) {
        this.#setStatus(id, "installing");
        await bridge().installDependencies(id);
        listing.dependenciesInstalled = true;
      }
      this.#setStatus(id, "starting");
      const { hasMain, themes } = await bridge().load(id);
      const plugin = new RunningPlugin(manifest, this);
      this.running.set(id, plugin);
      await plugin.start(themes, hasMain);
      this.#watch();
      this.#setStatus(id, "running");
    } catch (error) {
      this.running.get(id)?.stop("failed");
      this.running.delete(id);
      this.#setStatus(id, "failed", (error as Error).message);
    } finally {
      this.#starting.delete(id);
    }
  }

  #stop(id: string) {
    const plugin = this.running.get(id);
    this.running.delete(id);
    plugin?.stop();
    if (this.running.size === 0) this.#stopWatching?.();
  }

  /** Turns a plugin on or off, asking first if it needs anything. */
  async setEnabled(id: string, enabled: boolean) {
    const manifest = this.#listings.get(id)?.manifest;
    if (!enabled) {
      this.#stop(id);
      this.#records[id] = await bridge().setEnabled(id, false);
      this.#setStatus(id, "off");
      return;
    }
    if (!manifest) return;
    if (
      needsConsent(manifest) &&
      this.#records[id]?.grant !== grantFor(manifest)
    ) {
      if (!(await askConsent(manifest))) return;
      await bridge().setGrant(id, grantFor(manifest));
    }
    this.#records[id] = await bridge().setEnabled(id, true);
    await this.#start(id, true);
  }

  /** Stops and starts a plugin again, e.g. after editing its files. */
  async restart(id: string) {
    this.#stop(id);
    this.#logs.delete(id);
    await this.refresh();
    if (this.#records[id]?.enabled) await this.#start(id, true);
    else this.#publish();
  }

  /** Moves a plugin to the trash. */
  async remove(id: string) {
    this.#stop(id);
    await bridge().remove(id);
    this.#status.delete(id);
    this.#logs.delete(id);
    await this.refresh();
  }

  /** Installs a plugin from a folder or .zip the user picks. */
  async install(kind: "folder" | "zip") {
    const installed = await bridge().install(kind);
    if (!installed) return null;
    this.#stop(installed.id);
    this.#status.delete(installed.id);
    await this.refresh();
    if (this.#records[installed.id]?.enabled)
      await this.#start(installed.id, false);
    return installed.id;
  }

  openFolder(id?: string) {
    return bridge().openFolder(id);
  }

  async saveSettings(id: string, values: FormValues) {
    this.#records[id] = await bridge().setSettings(id, values);
    this.#publish();
    this.running.get(id)?.settingsChanged(this.settings(id));
  }

  // --- Keeping running plugins up to date ---

  #watch() {
    if (this.#stopWatching) return;
    let loaded = false;

    const pushProject = debounce(() => {
      const state = readProjectState();
      for (const plugin of this.running.values()) {
        const snapshot = buildSnapshot(state, plugin.id);
        plugin.notify("project", [snapshot]);
        if (loaded) plugin.notify("event", ["projectLoaded", snapshot]);
      }
      loaded = false;
    }, 50);

    const pushPlayback = throttle(() => {
      const duration = get(timePredictionStore)?.totalTime ?? 0;
      const payload = {
        time: (get(percentStore) / 100) * duration,
        duration,
        playing: get(playingStore),
      };
      for (const plugin of this.running.values()) {
        if (plugin.subscriptions.has("playback")) {
          plugin.notify("event", ["playback", payload]);
        }
      }
    }, 33);

    const pushSelection = () => {
      const point = get(selectedPointId);
      const stepId =
        point?.match(/^(?:wait|rotate|plugin|macro)-(.+)$/)?.[1] ?? null;
      const payload = { pathId: get(selectedLineId), stepId };
      for (const plugin of this.running.values()) {
        plugin.notify("event", ["selectionChanged", payload]);
      }
    };

    const updateMarkers = debounce(() => void resolveMarkers(), 150);

    const unsubscribers = [
      projectChanges.subscribe(() => pushProject()),
      percentStore.subscribe(() => pushPlayback()),
      playingStore.subscribe(() => pushPlayback()),
      selectedLineId.subscribe(pushSelection),
      selectedPointId.subscribe(pushSelection),
      timePredictionStore.subscribe(() => updateMarkers()),
      markerTypeRegistry.subscribe(() => updateMarkers()),
      hookRegistry.register("onLoad", () => {
        loaded = true;
      }),
      hookRegistry.register("onSave", () => {
        const state = readProjectState();
        for (const plugin of this.running.values()) {
          plugin.notify("event", [
            "projectSaved",
            buildSnapshot(state, plugin.id),
          ]);
        }
      }),
    ];
    this.#stopWatching = () => {
      pushProject.cancel();
      pushPlayback.cancel();
      updateMarkers.cancel();
      for (const unsubscribe of unsubscribers) unsubscribe();
      this.#stopWatching = null;
    };
  }

  // --- What running plugins ask of the host (PluginServices) ---

  bridge(): AppBridge {
    return appBridge();
  }

  settings(pluginId: string): FormValues {
    const fields = this.#settingsFields(this.#listings.get(pluginId)?.manifest);
    return { ...defaultsFor(fields), ...this.#records[pluginId]?.settings };
  }

  snapshot(pluginId: string): ProjectSnapshot {
    return buildSnapshot(readProjectState(), pluginId);
  }

  plan(): Plan {
    return currentPlan();
  }

  openSandbox(
    plugin: RunningPlugin,
    init: () => RuntimeInit,
    onPort: (port: MessagePort) => void,
  ) {
    if (!this.#frames?.isConnected) {
      this.#frames = document.createElement("div");
      this.#frames.id = "plugin-frames";
      this.#frames.setAttribute("aria-hidden", "true");
      document.body.append(this.#frames);
    }
    const frame = createHiddenFrame(
      pluginUrl(plugin.id, "__turtle/main.html"),
      `${plugin.manifest.name} (plugin)`,
    );
    const stopListening = connectToFrame(
      frame,
      () => ({ init: init() }),
      onPort,
    );
    this.#frames.append(frame);
    return () => {
      stopListening();
      frame.remove();
    };
  }

  onError(pluginId: string, message: string) {
    console.warn(`[plugin ${pluginId}]`, message);
    this.#addLog(pluginId, { level: "error", text: message });
  }

  #addLog(pluginId: string, line: LogLine) {
    const log = [...(this.#logs.get(pluginId) ?? []), line];
    this.#logs.set(pluginId, log.slice(-LOG_SIZE));
    this.#publish();
  }

  stopped(plugin: RunningPlugin) {
    if (this.running.get(plugin.id) !== plugin) return;
    this.running.delete(plugin.id);
    if (this.running.size === 0) this.#stopWatching?.();
    const status = plugin.state as PluginStatus;
    this.#setStatus(plugin.id, status);
    if (status === "paused" || status === "unresponsive") {
      notification.set({
        message: `${plugin.manifest.name} was stopped: ${
          status === "paused" ? "it kept failing" : "it stopped responding"
        }. See the plugin manager for details.`,
        type: "warning",
        timeout: 6000,
      });
    }
  }

  registerViews(plugin: RunningPlugin) {
    registerViews(plugin);
  }

  handleNotify(plugin: RunningPlugin, method: string, args: unknown[]) {
    const playback = appBridge().playback;
    switch (method) {
      case "log": {
        // The plugin's console. Logged, but not counted as a failure.
        const level =
          args[0] === "error" || args[0] === "warn" ? args[0] : "info";
        this.#addLog(plugin.id, {
          level,
          text: String(args[1]).slice(0, 2000),
        });
        return;
      }
      case "ui.toast": {
        // One toast every half second at most, so a plugin can't spam them.
        const now = Date.now();
        if (now - (this.#lastToast.get(plugin.id) ?? 0) < 500) return;
        this.#lastToast.set(plugin.id, now);
        const tone = TONES.find((t) => t === args[1]) ?? "info";
        notification.set({
          message: `${plugin.manifest.name}: ${String(args[0]).slice(0, 300)}`,
          type: tone,
          timeout: 4000,
        });
        return;
      }
      case "playback.seek": {
        const time = Number(args[0]);
        if (!Number.isFinite(time))
          throw new Error("seek needs a time in seconds.");
        const duration = playback.duration;
        playback.seek(
          duration > 0
            ? Math.max(0, Math.min(100, (time / duration) * 100))
            : 0,
        );
        return;
      }
      case "playback.play":
        playback.play();
        return;
      case "playback.pause":
        playback.pause();
        return;
      case "views.post": {
        const view = String(args[0]);
        if (!plugin.manifest.views?.[view]) {
          throw new Error(`This plugin has no view called "${view}".`);
        }
        postToViews(plugin.id, view, check(jsonSchema, args[1], "message"));
        return;
      }
      default:
        throw new Error(`Unknown notification "${method}".`);
    }
  }

  dialogs(pluginName: string) {
    return dialogsFor(pluginName);
  }

  storageGet(pluginId: string, key: string) {
    return bridge().storageGet(pluginId, key);
  }

  storageSet(pluginId: string, key: string, value: unknown) {
    return bridge().storageSet(pluginId, key, value);
  }

  async pickProjects(multiple: boolean): Promise<PickedProject[]> {
    const picked = await bridge().pickProjects(multiple);
    return picked.map((file) =>
      check(pickedProjectSchema, file, "project file"),
    );
  }

  async analyze(file: PickedProject) {
    return analyzeProject(file, "");
  }
}

export const pluginHost = new PluginHost();
