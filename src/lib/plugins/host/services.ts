// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What a running plugin needs from the host around it. PluginHost provides
// it; tests provide their own.
import type {
  AnalyzedProject,
  FormField,
  FormValues,
  PickedProject,
  Plan,
  ProjectSnapshot,
} from "../api";
import type { AppBridge } from "../bridge";
import type { RuntimeInit } from "../protocol/runtime";
import type { RunningPlugin } from "./RunningPlugin";

export interface PluginDialogs {
  confirm(options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
  }): Promise<boolean>;
  prompt(options: {
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
  }): Promise<string | null>;
  form(options: {
    title: string;
    fields: FormField[];
    values?: FormValues;
    submitLabel?: string;
  }): Promise<FormValues | null>;
}

export interface PluginServices {
  bridge(): AppBridge;
  /** A plugin's settings, defaults filled in. */
  settings(pluginId: string): FormValues;
  snapshot(pluginId: string): ProjectSnapshot;
  plan(): Plan;
  /**
   * Starts the sandbox a plugin's main script runs in (a hidden frame), and
   * calls `onPort` with the port to talk to it once it has connected.
   * Returns a function that closes the sandbox.
   */
  openSandbox(
    plugin: RunningPlugin,
    init: () => RuntimeInit,
    onPort: (port: MessagePort) => void,
  ): () => void;
  onError(pluginId: string, message: string): void;
  /** The plugin stopped by itself (it failed, was paused, or stopped responding). */
  stopped(plugin: RunningPlugin): void;
  registerViews(plugin: RunningPlugin): void;
  /** Notifications that aren't about the plugin's own bookkeeping. */
  handleNotify(plugin: RunningPlugin, method: string, args: unknown[]): void;
  /** Dialogs labelled with the plugin's name. */
  dialogs(pluginName: string): PluginDialogs;
  storageGet(pluginId: string, key: string): Promise<unknown>;
  storageSet(pluginId: string, key: string, value: unknown): Promise<void>;
  pickProjects(multiple: boolean): Promise<PickedProject[]>;
  analyze(file: PickedProject): Promise<AnalyzedProject>;
}
