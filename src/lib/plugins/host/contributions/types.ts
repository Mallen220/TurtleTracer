// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// What a contribution adapter gets from the plugin it belongs to.
import type { FieldPoint, Plan, ProjectSnapshot } from "../../api";
import type { PluginManifest } from "../../protocol/ipc";

export interface PluginContext {
  readonly id: string;
  readonly manifest: PluginManifest;
  /**
   * Calls a function the plugin registered. Rejects (and counts against the
   * plugin) if it throws or takes longer than `timeoutMs`.
   */
  invoke(
    registrationId: string,
    path: string,
    args: unknown[],
    timeoutMs: number,
  ): Promise<unknown>;
  /** Runs one of the plugin's commands by its own id. */
  runCommand(commandId: string, context?: { at?: FieldPoint }): void;
  /** Records a problem against the plugin. */
  reportError(error: unknown): void;
  snapshot(): ProjectSnapshot;
  plan(): Plan;
}

/** Something a plugin added, which the host can take away again. */
export interface Contribution {
  dispose(): void;
  /** For contributions the plugin keeps updating (a layer's drawing, say). */
  update?(method: string, args: unknown[]): void;
}

export type ContributionFactory = (
  plugin: PluginContext,
  registrationId: string,
  definition: unknown,
  callbacks: readonly string[],
) => Contribution;
