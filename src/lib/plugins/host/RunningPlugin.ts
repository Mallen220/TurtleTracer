// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// One plugin while it's on: its sandboxed frame, the connection to it, and
// everything it has added to the app. A plugin that throws, floods the app
// with messages, sends bad data or stops answering is stopped, and all of
// its contributions go with it.
import type {
  FieldPoint,
  FormValues,
  JsonValue,
  Plan,
  ProjectSnapshot,
} from "../api";
import type { PluginManifest } from "../protocol/ipc";
import { Rpc, RpcTimeoutError, errorText, type Message } from "../protocol/rpc";
import {
  HEARTBEAT_MS,
  UNRESPONSIVE_MS,
  type ContributionKind,
  type RuntimeInit,
} from "../protocol/runtime";
import {
  commandRegistry,
  fieldContextMenuRegistry,
  fieldLayerRegistry,
  fieldViewRegistry,
  markerTypeRegistry,
  navbarActionRegistry,
  simulatorRegistry,
  tabRegistry,
  themeRegistry,
} from "../../registries";
import { exporterRegistry } from "../../exporters";
import { actionRegistry } from "../../actionRegistry";
import {
  commandFactory,
  contextMenuItemFactory,
  createCommandTable,
  navbarButtonFactory,
  COMMAND_TIMEOUT_MS,
} from "./contributions/commands";
import { exporterFactory } from "./contributions/exporters";
import { layerFactory } from "./contributions/layers";
import { actionFactory } from "./contributions/actions";
import { markerFactory } from "./contributions/markers";
import { simulatorFactory } from "./contributions/simulators";
import type {
  Contribution,
  ContributionFactory,
  PluginContext,
} from "./contributions/types";
import { createHiddenFrame, connectToFrame, pluginUrl } from "./sandbox";
import { sanitizeCss } from "./sanitize";
import { check, messageSchema } from "./schemas";
import { handleCall } from "./calls";
import type { PluginServices } from "./services";

export type RunState =
  | "starting"
  | "running"
  | "stopped"
  | "failed"
  | "paused"
  | "unresponsive";

/** How long a plugin's main script has to start. */
const START_TIMEOUT_MS = 15_000;
/** This many errors in ERROR_WINDOW_MS pause a plugin. */
const ERROR_LIMIT = 5;
const ERROR_WINDOW_MS = 30_000;
/** More messages than this in a second pause a plugin. */
const MESSAGE_LIMIT = 2000;

const ID = /^[a-zA-Z]+:\d{1,9}$/;

export class RunningPlugin implements PluginContext {
  readonly id: string;
  readonly manifest: PluginManifest;
  state: RunState = "starting";

  #services: PluginServices;
  #frame: HTMLIFrameElement | null = null;
  #rpc: Rpc | null = null;
  #stopListening: (() => void) | null = null;
  #heartbeat: ReturnType<typeof setInterval> | null = null;
  #contributions = new Map<string, Contribution>();
  #commands = createCommandTable();
  #factories: Record<ContributionKind, ContributionFactory>;
  #errorTimes: number[] = [];
  #messageCount = 0;
  #messageWindow = 0;
  #pendingInvokes = 0;
  #ready: { resolve(): void; reject(error: Error): void } | null = null;
  readonly subscriptions = new Set<string>();

  constructor(manifest: PluginManifest, services: PluginServices) {
    this.id = manifest.id;
    this.manifest = manifest;
    this.#services = services;
    this.#factories = {
      command: commandFactory(this.#commands),
      navbarButton: navbarButtonFactory(this.#commands),
      contextMenuItem: contextMenuItemFactory(this.#commands),
      layer: layerFactory,
      action: actionFactory,
      marker: markerFactory,
      exporter: exporterFactory,
      simulator: simulatorFactory,
    };
  }

  /** Whether the plugin may change more than its own steps. */
  get canWrite() {
    return this.manifest.permissions?.includes("project.write") ?? false;
  }

  /** Starts the plugin: its themes and views, then its main script. */
  async start(themes: { name: string; css: string }[], hasMain: boolean) {
    for (const theme of themes) {
      themeRegistry.register({
        id: `plugin:${this.id}:${theme.name}`,
        owner: this.id,
        name: theme.name,
        css: sanitizeCss(theme.css),
      });
    }
    this.#services.registerViews(this);

    if (hasMain) {
      await new Promise<void>((resolve, reject) => {
        this.#ready = { resolve, reject };
        const timer = setTimeout(
          () => reject(new Error("The plugin took too long to start.")),
          START_TIMEOUT_MS,
        );
        const settle = () => clearTimeout(timer);
        this.#ready = {
          resolve: () => (settle(), resolve()),
          reject: (e) => (settle(), reject(e)),
        };
        this.#openFrame();
      }).catch((error) => {
        this.stop("failed");
        throw error;
      });
      this.#ready = null;
      this.#heartbeat = setInterval(
        () => this.#checkResponding(),
        HEARTBEAT_MS,
      );
    }
    this.state = "running";
  }

  /** Stops the plugin and takes away everything it added. */
  stop(state: Exclude<RunState, "starting" | "running"> = "stopped") {
    if (this.state !== "starting" && this.state !== "running") return;
    this.state = state;
    if (this.#heartbeat) clearInterval(this.#heartbeat);
    this.#rpc?.close("The plugin was stopped.");
    this.#stopListening?.();
    this.#frame?.remove();
    this.#frame = null;
    for (const contribution of this.#contributions.values()) {
      try {
        contribution.dispose();
      } catch (error) {
        console.error(`Couldn't remove part of plugin ${this.id}:`, error);
      }
    }
    this.#contributions.clear();
    // Anything left over, including its views and themes.
    for (const registry of [
      commandRegistry,
      fieldContextMenuRegistry,
      fieldLayerRegistry,
      fieldViewRegistry,
      navbarActionRegistry,
      tabRegistry,
      themeRegistry,
      exporterRegistry,
      actionRegistry,
      markerTypeRegistry,
      simulatorRegistry,
    ]) {
      registry.removeOwner(this.id);
    }
    this.#ready?.reject(new Error("The plugin was stopped."));
    if (state !== "stopped") this.#services.stopped(this);
  }

  // --- Talking to the plugin ---

  #openFrame() {
    const frame = createHiddenFrame(
      pluginUrl(this.id, "__turtle/main.html"),
      `${this.manifest.name} (plugin)`,
    );
    this.#frame = frame;
    this.#stopListening = connectToFrame(
      frame,
      () => ({ init: this.#init() }),
      (port) => this.#connect(port),
    );
    this.#services.frameContainer().append(frame);
  }

  #init(): RuntimeInit {
    return {
      plugin: {
        id: this.id,
        name: this.manifest.name,
        version: this.manifest.version,
      },
      project: this.snapshot(),
      settings: this.#services.settings(this.id),
    };
  }

  #connect(port: MessagePort) {
    if (this.#rpc) {
      // The frame said hello twice; it only gets one connection.
      port.close();
      return;
    }
    const rpc = new Rpc((message) => port.postMessage(message), {
      call: (method, args) => handleCall(this, this.#services, method, args),
      notify: (method, args) => this.#handleNotify(method, args),
    });
    this.#rpc = rpc;
    port.onmessage = (event) => {
      if (!this.#countMessage()) return;
      let message: Message;
      try {
        message = check(messageSchema, event.data, "message") as Message;
      } catch (error) {
        this.reportError(error);
        return;
      }
      void rpc.receive(message);
    };
  }

  /** Counts a message from the plugin; false once it's sending too many. */
  #countMessage() {
    const second = Math.floor(Date.now() / 1000);
    if (second !== this.#messageWindow) {
      this.#messageWindow = second;
      this.#messageCount = 0;
    }
    if (++this.#messageCount <= MESSAGE_LIMIT) return true;
    this.#services.onError(
      this.id,
      "It sent too many messages, so it was paused.",
    );
    this.stop("paused");
    return false;
  }

  #handleNotify(method: string, args: unknown[]) {
    try {
      switch (method) {
        case "ready":
          this.#ready?.resolve();
          return;
        case "error":
          if (this.#ready) {
            this.#ready.reject(new Error(errorText(args[0])));
          } else {
            this.reportError(args[0]);
          }
          return;
        case "register":
          this.#register(args);
          return;
        case "unregister": {
          const id = String(args[0]);
          this.#contributions.get(id)?.dispose();
          this.#contributions.delete(id);
          return;
        }
        case "layer.draw":
        case "layer.track": {
          const contribution = this.#contributions.get(String(args[0]));
          contribution?.update?.(method.slice("layer.".length), args.slice(1));
          return;
        }
        case "subscribe":
          if (args[1] === true) this.subscriptions.add(String(args[0]));
          else this.subscriptions.delete(String(args[0]));
          return;
        default:
          this.#services.handleNotify(this, method, args);
      }
    } catch (error) {
      this.reportError(error);
    }
  }

  #register(args: unknown[]) {
    const [kind, id, definition, callbacks] = args;
    const factory =
      typeof kind === "string" && Object.hasOwn(this.#factories, kind)
        ? this.#factories[kind as ContributionKind]
        : undefined;
    if (!factory) throw new Error(`Unknown contribution "${String(kind)}".`);
    if (typeof id !== "string" || !ID.test(id) || this.#contributions.has(id)) {
      throw new Error("Bad registration id.");
    }
    const names = Array.isArray(callbacks)
      ? callbacks.filter((c): c is string => typeof c === "string").slice(0, 32)
      : [];
    this.#contributions.set(id, factory(this, id, definition, names));
  }

  /** Sends the plugin a notification. */
  notify(method: string, args: unknown[]) {
    this.#rpc?.notify(method, args);
  }

  async invoke(
    registrationId: string,
    path: string,
    args: unknown[],
    timeoutMs: number,
  ): Promise<unknown> {
    if (!this.#rpc) throw new Error(`${this.manifest.name} isn't running.`);
    this.#pendingInvokes++;
    try {
      return await this.#rpc.call(
        "invoke",
        [registrationId, path, ...args],
        timeoutMs,
      );
    } catch (error) {
      this.reportError(error);
      throw error;
    } finally {
      this.#pendingInvokes--;
    }
  }

  runCommand(commandId: string, context: { at?: FieldPoint } = {}) {
    const command = this.#commands.get(commandId);
    if (!command) {
      this.reportError(new Error(`There's no command "${commandId}".`));
      return;
    }
    this.invoke(
      command.registrationId,
      "run",
      [context],
      COMMAND_TIMEOUT_MS,
    ).catch(() => {});
  }

  /** Pings the plugin; one that doesn't answer is stopped. */
  #checkResponding() {
    // A call it's busy working on has its own time limit.
    if (!this.#rpc || this.#pendingInvokes > 0) return;
    this.#rpc.call("ping", [], UNRESPONSIVE_MS).catch((error) => {
      if (!(error instanceof RpcTimeoutError) || this.state !== "running")
        return;
      this.#services.onError(
        this.id,
        "It stopped responding, so it was stopped.",
      );
      this.stop("unresponsive");
    });
  }

  reportError(error: unknown) {
    if (this.state !== "running" && this.state !== "starting") return;
    this.#services.onError(this.id, errorText(error));
    const now = Date.now();
    this.#errorTimes = [...this.#errorTimes, now].filter(
      (t) => now - t < ERROR_WINDOW_MS,
    );
    if (this.#errorTimes.length >= ERROR_LIMIT) {
      this.#services.onError(this.id, "It kept failing, so it was paused.");
      this.stop("paused");
    }
  }

  snapshot(): ProjectSnapshot {
    return this.#services.snapshot(this.id);
  }

  plan(): Plan {
    return this.#services.plan();
  }

  /** Called by the host when the user changes the plugin's settings. */
  settingsChanged(values: FormValues) {
    this.notify("settings", [values]);
  }

  /** Relays a message from one of the plugin's views to its main script. */
  messageFromView(view: string, message: JsonValue) {
    this.notify("views.message", [view, message]);
  }
}
