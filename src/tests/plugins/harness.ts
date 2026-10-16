// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Runs a plugin's runtime in the test process, connected to a real
// RunningPlugin over a MessageChannel, so the whole path from `turtle` to
// the app's registries is tested without a browser frame.
import { vi } from "vitest";
import type { Plan, ProjectSnapshot, TurtleAPI } from "../../lib/plugins/api";
import type { PluginManifest } from "../../lib/plugins/protocol/ipc";
import { Rpc, type Message } from "../../lib/plugins/protocol/rpc";
import { createRuntime } from "../../lib/plugins/runtime/createTurtle";
import { RunningPlugin } from "../../lib/plugins/host/RunningPlugin";
import type { PluginServices } from "../../lib/plugins/host/services";

export const emptySnapshot = (): ProjectSnapshot => ({
  fileName: null,
  start: { x: 10, y: 20, heading: 0 },
  paths: [],
  steps: [],
  shapes: [],
  robot: {
    length: 18,
    width: 18,
    maxVelocity: 40,
    maxAcceleration: 30,
    maxDeceleration: 30,
    maxAngularVelocity: 3,
    driveType: "holonomic",
  },
  field: { width: 144, height: 144 },
  units: "imperial",
  data: null,
});

export const emptyPlan = (): Plan => ({
  duration: 1,
  poses: { t: [0, 1], x: [10, 20], y: [20, 20], heading: [0, 0] },
  steps: [],
  paths: [],
});

export const manifest = (overrides: Partial<PluginManifest> = {}) =>
  ({
    id: "test-plugin",
    name: "Test Plugin",
    version: "1.0.0",
    apiVersion: 2,
    main: "main.ts",
    ...overrides,
  }) satisfies PluginManifest;

export interface Harness {
  plugin: RunningPlugin;
  services: PluginServices & {
    onError: ReturnType<typeof vi.fn>;
    stopped: ReturnType<typeof vi.fn>;
    handleNotify: ReturnType<typeof vi.fn>;
  };
  /** Messages the runtime sent, for tests that look at the protocol. */
  sent: Message[];
  /** The plugin's own end, to send it raw messages as a hostile plugin would. */
  pluginPort: () => MessagePort;
}

/** Lets queued messages through. */
export const settle = (ms = 5) => new Promise((r) => setTimeout(r, ms));

/**
 * Starts a plugin whose main script is `main`. `services` overrides parts
 * of the fake host.
 */
export async function startPlugin(
  main: (turtle: TurtleAPI) => void,
  options: {
    manifest?: Partial<PluginManifest>;
    services?: Partial<PluginServices>;
  } = {},
): Promise<Harness> {
  const sent: Message[] = [];
  let pluginPort: MessagePort | null = null;
  const services = {
    bridge: () => ({
      recordChange: vi.fn(),
      playback: { seek: vi.fn(), play: vi.fn(), pause: vi.fn(), duration: 10 },
    }),
    settings: () => ({}),
    snapshot: () => emptySnapshot(),
    plan: () => emptyPlan(),
    onError: vi.fn(),
    stopped: vi.fn(),
    registerViews: vi.fn(),
    handleNotify: vi.fn(),
    dialogs: () => ({
      confirm: vi.fn(async () => true),
      prompt: vi.fn(async () => "typed"),
      form: vi.fn(async () => ({ answer: 42 })),
    }),
    storageGet: vi.fn(async () => undefined),
    storageSet: vi.fn(async () => {}),
    pickProjects: vi.fn(async () => []),
    analyze: vi.fn(),
    openSandbox(_plugin, init, onPort) {
      const channel = new MessageChannel();
      pluginPort = channel.port2;
      let runtime: ReturnType<typeof createRuntime> | undefined;
      const rpc = new Rpc(
        (message) => {
          sent.push(message);
          channel.port2.postMessage(message);
        },
        {
          call: (method, args) => runtime?.handleCall(method, args),
          notify: (method, args) => runtime?.handleNotify(method, args),
        },
      );
      runtime = createRuntime(rpc, init());
      channel.port2.onmessage = (e) => void rpc.receive(e.data);
      onPort(channel.port1);
      queueMicrotask(() => {
        try {
          main(runtime!.turtle);
          rpc.notify("ready");
        } catch (error) {
          rpc.notify("error", [String(error)]);
        }
      });
      return () => {
        channel.port1.close();
        channel.port2.close();
      };
    },
    ...options.services,
  } as Harness["services"];

  const plugin = new RunningPlugin(manifest(options.manifest), services);
  await plugin.start([], true);
  await settle();
  return { plugin, services, sent, pluginPort: () => pluginPort! };
}
