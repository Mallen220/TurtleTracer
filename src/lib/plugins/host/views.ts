// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Plugin views: pages from a plugin shown in a sandboxed frame, as another
// way of showing the field ("field" slot) or as a control tab ("panel"
// slot). This keeps each open view supplied with the scene and the robot's
// pose, and relays messages between a view and its plugin's main script.
import { get } from "svelte/store";
import type { JsonValue, ViewFrame, ViewScene } from "../api";
import type { Settings } from "../../../types";
import { DEFAULT_FIELD_MAP } from "../../../config";
import {
  percentStore,
  playingStore,
  robotHeadingStore,
  robotXYStore,
  settingsStore,
  timePredictionStore,
} from "../../projectStore";
import { fieldViewRegistry, tabRegistry } from "../../registries";
import PluginView from "../ui/PluginView.svelte";
import { appBridge } from "../bridge";
import { currentPlan, projectChanges } from "./project";
import type { RunningPlugin } from "./RunningPlugin";

/** An open view, as the host sees it. */
interface OpenView {
  plugin: RunningPlugin;
  name: string;
  send(type: "scene" | "frame" | "message", payload: unknown): void;
}

const open = new Set<OpenView>();
const fieldImages = new Map<string, Promise<string | null>>();

/** The field image as a data URL (a view can't load the app's own URLs). */
function fieldImage(settings: Settings): Promise<string | null> {
  const custom = settings.customMaps?.find((m) => m.id === settings.fieldMap);
  if (custom) return Promise.resolve(custom.imageData);
  const file =
    settings.fieldMap && !settings.fieldMap.includes("custom")
      ? settings.fieldMap
      : DEFAULT_FIELD_MAP;
  if (!fieldImages.has(file)) {
    fieldImages.set(
      file,
      fetch(`/fields/${file}`)
        .then((res) => (res.ok ? res.blob() : null))
        .then(
          (blob) =>
            blob &&
            new Promise<string>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(String(reader.result));
              reader.onerror = () => reject(reader.error);
              reader.readAsDataURL(blob);
            }),
        )
        .catch(() => null),
    );
  }
  return fieldImages.get(file)!;
}

function theme(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** The scene for one of a plugin's views. */
export async function sceneFor(plugin: RunningPlugin): Promise<ViewScene> {
  return {
    project: plugin.snapshot(),
    plan: currentPlan(),
    theme: theme(),
    fieldImage: await fieldImage(get(settingsStore)),
  };
}

/** Where the robot is now, in the API's terms. */
export function currentFrame(): ViewFrame {
  const xy = get(robotXYStore);
  const percent = get(percentStore);
  const duration = get(timePredictionStore)?.totalTime ?? 0;
  return {
    time: (percent / 100) * duration,
    playing: get(playingStore),
    // The store holds the on-screen heading, which turns the other way.
    pose: { x: xy.x, y: xy.y, heading: -get(robotHeadingStore) },
  };
}

let stopWatching: (() => void) | null = null;

/** Keeps open views up to date while there are any. */
function watch() {
  if (stopWatching) return;
  let sceneQueued = false;
  let frameQueued = false;

  const sendScenes = () => {
    if (sceneQueued) return;
    sceneQueued = true;
    requestAnimationFrame(async () => {
      sceneQueued = false;
      for (const view of open) view.send("scene", await sceneFor(view.plugin));
    });
  };
  const sendFrames = () => {
    if (frameQueued) return;
    frameQueued = true;
    requestAnimationFrame(() => {
      frameQueued = false;
      const frame = currentFrame();
      for (const view of open) view.send("frame", frame);
    });
  };

  const themeObserver = new MutationObserver(sendScenes);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });
  const unsubscribers = [
    projectChanges.subscribe(sendScenes),
    timePredictionStore.subscribe(sendScenes),
    robotXYStore.subscribe(sendFrames),
    robotHeadingStore.subscribe(sendFrames),
    playingStore.subscribe(sendFrames),
  ];
  stopWatching = () => {
    themeObserver.disconnect();
    for (const unsubscribe of unsubscribers) unsubscribe();
    stopWatching = null;
  };
}

/** Registers a plugin's views (from its manifest) where they belong. */
export function registerViews(plugin: RunningPlugin) {
  for (const [name, view] of Object.entries(plugin.manifest.views ?? {})) {
    const id = `plugin:${plugin.id}:${name}`;
    const props = { plugin, name, entry: view.entry, title: view.title };
    if (view.slot === "field") {
      fieldViewRegistry.register({
        id,
        owner: plugin.id,
        title: view.title,
        component: PluginView,
        props,
      });
    } else {
      tabRegistry.register({
        id,
        owner: plugin.id,
        label: view.title,
        component: PluginView,
        props,
        order: 100,
      });
    }
  }
}

/** Called by a PluginView once its frame has connected. */
export function viewOpened(view: OpenView) {
  open.add(view);
  watch();
  return () => {
    open.delete(view);
    if (open.size === 0) stopWatching?.();
  };
}

/** Sends a message from a plugin's main script to its views called `name`. */
export function postToViews(pluginId: string, name: string, message: unknown) {
  for (const view of open) {
    if (view.plugin.id === pluginId && view.name === name) {
      view.send("message", message);
    }
  }
}

/** What a view asked for. */
export function handleViewRequest(
  plugin: RunningPlugin,
  name: string,
  type: string,
  payload: unknown,
) {
  const playback = appBridge().playback;
  switch (type) {
    case "post":
      plugin.messageFromView(name, payload as JsonValue);
      break;
    case "seek":
      if (typeof payload === "number" && Number.isFinite(payload)) {
        const duration = playback.duration;
        playback.seek(duration > 0 ? (payload / duration) * 100 : 0);
      }
      break;
    case "play":
      playback.play();
      break;
    case "pause":
      playback.pause();
      break;
    case "error":
      plugin.reportError(`View "${name}": ${String(payload).slice(0, 2000)}`);
      break;
  }
}
