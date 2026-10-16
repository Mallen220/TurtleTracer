// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, afterEach } from "vitest";
import { get } from "svelte/store";
import {
  commandRegistry,
  fieldContextMenuRegistry,
  fieldLayerRegistry,
  markerTypeRegistry,
  navbarActionRegistry,
  simulatorRegistry,
  themeRegistry,
} from "../../lib/registries";
import { exporterRegistry } from "../../lib/exporters";
import { actionRegistry } from "../../lib/actionRegistry";
import {
  extraDataStore,
  sequenceStore,
  timingRevisionStore,
} from "../../lib/projectStore";
import { isUnsaved } from "../../stores";
import type { SequencePluginItem, TimeCalculationContext } from "../../types";
import { Rpc } from "../../lib/plugins/protocol/rpc";
import { createRuntime } from "../../lib/plugins/runtime/createTurtle";
import { RunningPlugin } from "../../lib/plugins/host/RunningPlugin";
import {
  emptyPlan,
  manifest,
  settle,
  startPlugin,
  type Harness,
} from "./harness";

let running: Harness | null = null;
async function start(...args: Parameters<typeof startPlugin>) {
  running = await startPlugin(...args);
  return running;
}

afterEach(() => {
  running?.plugin.stop();
  running = null;
  vi.useRealTimers();
});

const timing = (overrides: Partial<TimeCalculationContext> = {}) =>
  ({
    currentTime: 2,
    currentHeading: 90,
    lastPoint: { x: 1, y: 2, heading: "tangential", reverse: false },
    settings: {} as any,
    lines: [],
    ...overrides,
  }) as TimeCalculationContext;

describe("starting and stopping", () => {
  it("runs the main script and reports running", async () => {
    const main = vi.fn();
    const { plugin } = await start(main);
    expect(main).toHaveBeenCalled();
    expect(plugin.state).toBe("running");
  });

  it("registers themes from the manifest, cleaned", async () => {
    const services = (await start(() => {})).services;
    const plugin = new RunningPlugin(manifest({ id: "themed" }), services);
    await plugin.start(
      [
        {
          name: "Dark Pink",
          css: "a{color:red}@import 'x.css'; b{background:url(http://x)}",
        },
      ],
      false,
    );
    const theme = get(themeRegistry).find((t) => t.owner === "themed");
    expect(theme?.css).toBe("a{color:red} b{background:none}");
    plugin.stop();
    expect(get(themeRegistry).some((t) => t.owner === "themed")).toBe(false);
  });

  it("fails to start when the main script throws, leaving nothing behind", async () => {
    await expect(
      startPlugin((turtle) => {
        turtle.commands.register({ id: "a", label: "A", run() {} });
        throw new Error("broken at load");
      }),
    ).rejects.toThrow("broken at load");
    expect(get(commandRegistry)).toEqual([]);
  });

  it("takes away everything it added when stopped", async () => {
    const { plugin } = await start((turtle) => {
      turtle.commands.register({ id: "a", label: "A", run() {} });
      turtle.field.addLayer({ draw: () => [] });
      turtle.exporters.register({ name: "x", label: "X", export: () => "" });
      turtle.actions.register({ name: "go", label: "Go" });
    });
    await settle();
    expect(get(commandRegistry)).toHaveLength(1);
    plugin.stop();
    expect(get(commandRegistry)).toEqual([]);
    expect(get(fieldLayerRegistry)).toEqual([]);
    expect(exporterRegistry.get("plugin:test-plugin.x")).toBeUndefined();
    expect(actionRegistry.get("test-plugin.go")).toBeUndefined();
  });
});

describe("commands, buttons and menus", () => {
  it("lists commands under the plugin's name and runs them", async () => {
    const run = vi.fn();
    await start((turtle) => {
      turtle.commands.register({ id: "hello", label: "Say hello", run });
    });
    const [command] = get(commandRegistry);
    expect(command).toMatchObject({
      label: "Say hello",
      category: "Test Plugin",
    });
    command.run();
    await settle();
    expect(run).toHaveBeenCalledWith({});
  });

  it("adds navbar buttons and menu items that run a command", async () => {
    const run = vi.fn();
    await start((turtle) => {
      turtle.commands.register({ id: "note", label: "Add note", run });
      turtle.ui.addNavbarButton({
        command: "note",
        icon: '<svg><script>alert(1)</script><path d="M0 0"/></svg>',
      });
      turtle.ui.addContextMenuItem({ command: "note" });
    });
    await settle();
    const [button] = get(navbarActionRegistry);
    expect(button.title).toBe("Add note");
    expect(button.icon).not.toContain("script");
    const [item] = get(fieldContextMenuRegistry);
    expect(item.label).toBe("Add note");
    item.onClick({ x: 3, y: 4 });
    await settle();
    expect(run).toHaveBeenCalledWith({ at: { x: 3, y: 4 } });
  });

  it("reports a command that doesn't exist", async () => {
    const { plugin, services } = await start(() => {});
    plugin.runCommand("missing");
    expect(services.onError).toHaveBeenCalledWith(
      "test-plugin",
      expect.stringContaining("missing"),
    );
  });
});

describe("field layers", () => {
  it("publishes what the layer draws, and redraws on request", async () => {
    let size = 1;
    let redraw = () => {};
    await start((turtle) => {
      const layer = turtle.field.addLayer({
        draw: () => [{ type: "circle", x: 1, y: 2, radius: size }],
      });
      redraw = () => layer.redraw();
    });
    expect(get(fieldLayerRegistry)[0].primitives).toEqual([
      { type: "circle", x: 1, y: 2, radius: 1 },
    ]);
    size = 5;
    redraw();
    await settle();
    expect(get(fieldLayerRegistry)[0].primitives[0]).toMatchObject({
      radius: 5,
    });
  });

  it("keeps the last good drawing when a drawing is invalid", async () => {
    let bad = false;
    let redraw = () => {};
    const { services } = await start((turtle) => {
      const layer = turtle.field.addLayer({
        draw: () => [
          bad
            ? { type: "circle", x: Number.NaN, y: 0, radius: 1 }
            : { type: "circle", x: 0, y: 0, radius: 1 },
        ],
      });
      redraw = () => layer.redraw();
    });
    bad = true;
    redraw();
    await settle();
    expect(get(fieldLayerRegistry)[0].primitives[0]).toMatchObject({ x: 0 });
    expect(services.onError).toHaveBeenCalledWith(
      "test-plugin",
      expect.stringContaining("Invalid drawing"),
    );
  });

  it("keeps tracks and tells the plugin about clicks", async () => {
    const onClick = vi.fn();
    await start((turtle) => {
      const layer = turtle.field.addLayer({
        draw: () => [{ type: "robot", track: "ghost", id: "r" }],
        onClick,
      });
      layer.setTrack("ghost", {
        t: [0, 1],
        x: [0, 1],
        y: [0, 1],
        heading: [0, 0],
      });
    });
    await settle();
    const [layer] = get(fieldLayerRegistry);
    expect(layer.tracks.ghost.x).toEqual([0, 1]);
    layer.onClick?.("r", { x: 5, y: 6 });
    await settle();
    expect(onClick).toHaveBeenCalledWith("r", { x: 5, y: 6 });
  });

  it("redraws layers when the project changes", async () => {
    const draw = vi.fn(() => []);
    const { plugin } = await start((turtle) => {
      turtle.field.addLayer({ draw });
    });
    draw.mockClear();
    plugin.notify("project", [
      { ...(await import("./harness")).emptySnapshot() },
    ]);
    await settle();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});

describe("exporters", () => {
  it("exports what the plugin returns", async () => {
    await start((turtle) => {
      turtle.exporters.register({
        name: "csv",
        label: "CSV",
        extension: "csv",
        export: ({ plan }) => `duration,${plan.duration}`,
      });
    });
    await settle();
    const exporter = exporterRegistry.get("plugin:test-plugin.csv")!;
    expect(exporter).toMatchObject({
      name: "CSV",
      owner: "test-plugin",
      extension: "csv",
    });
    await expect(exporter.exportCode({} as any, {})).resolves.toBe(
      "duration,1",
    );
  });

  it("fails an export when the plugin throws, and counts it", async () => {
    const { services } = await start((turtle) => {
      turtle.exporters.register({
        name: "bad",
        label: "Bad",
        export: () => {
          throw new Error("boom");
        },
      });
    });
    await settle();
    await expect(
      exporterRegistry.get("plugin:test-plugin.bad")!.exportCode({} as any, {}),
    ).rejects.toThrow("boom");
    expect(services.onError).toHaveBeenCalled();
  });
});

describe("action types", () => {
  const intake = (turtle: Parameters<Parameters<typeof startPlugin>[0]>[0]) =>
    turtle.actions.register({
      name: "intake",
      label: "Intake",
      color: "#0d9488",
      fields: [
        {
          key: "seconds",
          type: "number",
          unit: "time",
          label: "Run for",
          default: 0.8,
        },
        { key: "power", type: "number", label: "Power", default: 1 },
      ],
      timing: { secondsFrom: "seconds" },
      code: {
        sequential: ({ step }) => `new RunIntake(${step.data.power})`,
        java: ({ state }) => ({ code: `case ${state}: break;`, states: 1 }),
      },
    });

  it("becomes an action with defaults, timing and code", async () => {
    await start(intake);
    await settle();
    const action = actionRegistry.get("test-plugin.intake")!;
    expect(action).toMatchObject({
      label: "Intake",
      color: "#0d9488",
      owner: "test-plugin",
    });

    const step = action.createDefault!() as SequencePluginItem;
    expect(step).toMatchObject({
      kind: "plugin",
      type: "test-plugin.intake",
      data: { seconds: 0.8, power: 1 },
    });

    const result = action.calculateTime!(step, timing());
    expect(result.duration).toBe(0.8);
    expect(result.events[0]).toMatchObject({
      type: "wait",
      startTime: 2,
      endTime: 2.8,
      waitId: step.id,
    });

    const ctx = { targetLibrary: "SolversLib" as const };
    // Before its code is fetched, a timed step exports as a wait.
    expect(action.toSequentialCommand!(step, ctx)).toContain(
      "WaitCommand(800)",
    );
    await action.prepareCode!(step, ctx);
    expect(action.toSequentialCommand!(step, ctx)).toBe("new RunIntake(1)");
    await action.prepareCode!(step, { stateStep: 4 });
    expect(action.toJavaCode!(step, { stateStep: 4 })).toEqual({
      code: "case 4: break;",
      stepsUsed: 1,
    });
  });

  it("asks a `time` callback and uses the answer once it arrives", async () => {
    const before = get(timingRevisionStore);
    await start((turtle) => {
      turtle.actions.register({
        name: "drive",
        label: "Drive",
        time: ({ start }) => ({
          seconds: 2,
          poses: {
            t: [0, 2],
            x: [start.x, start.x + 10],
            y: [start.y, start.y],
            heading: [0, 45],
          },
        }),
      });
    });
    await settle();
    const action = actionRegistry.get("test-plugin.drive")!;
    const step = action.createDefault!();

    expect(action.calculateTime!(step, timing()).duration).toBe(0);
    await settle();
    expect(get(timingRevisionStore)).toBe(before + 1);

    const result = action.calculateTime!(step, timing());
    expect(result.duration).toBe(2);
    expect(result.endPoint).toMatchObject({ x: 11, y: 2 });
    expect(result.endHeading).toBe(45);
    expect(result.events[0].trace?.x).toEqual([1, 11]);
  });

  it("is removed only by the registration that made it", async () => {
    const { plugin } = await start(intake);
    await settle();
    const replacement = { ...actionRegistry.get("test-plugin.intake")! };
    actionRegistry.register(replacement);
    plugin.stop();
    // removeOwner still clears it: it belongs to the plugin.
    expect(actionRegistry.get("test-plugin.intake")).toBeUndefined();
  });
});

describe("marker types and simulators", () => {
  it("resolves markers with the plugin's answer", async () => {
    await start((turtle) => {
      turtle.markers.register({
        name: "half",
        label: "Halfway",
        resolve: ({ step }) => (step.end - step.start) / 2,
      });
    });
    await settle();
    const type = get(markerTypeRegistry)[0];
    expect(type).toMatchObject({ id: "test-plugin.half", label: "Halfway" });
    const plan = emptyPlan();
    plan.steps = [{ id: "s1", kind: "wait", start: 1, end: 3 }];
    running!.services.plan = () => plan;
    await expect(
      type.resolve({ id: "m", name: "x", position: 0 }, "s1"),
    ).resolves.toBe(1);
    await expect(
      type.resolve({ id: "m", name: "x", position: 0 }, "nope"),
    ).resolves.toBeNull();
  });

  it("simulates, and rejects a result whose time goes backwards", async () => {
    let backwards = false;
    await start((turtle) => {
      turtle.simulators.register({
        name: "sim",
        label: "Sim",
        simulate: () => ({
          poses: backwards
            ? { t: [1, 0], x: [0, 0], y: [0, 0], heading: [0, 0] }
            : { t: [0, 1], x: [0, 1], y: [0, 1], heading: [0, 0] },
          notes: [{ time: 0.5, text: "slip" }],
        }),
      });
    });
    await settle();
    const [simulator] = get(simulatorRegistry);
    await expect(simulator.simulate()).resolves.toMatchObject({
      notes: [{ text: "slip" }],
    });
    backwards = true;
    await expect(simulator.simulate()).rejects.toThrow(/backwards/);
  });
});

describe("calls into the app", () => {
  it("shows dialogs, one at a time per plugin", async () => {
    let answer: (value: string) => void = () => {};
    const prompt = vi.fn(() => new Promise<string>((r) => (answer = r)));
    let results: unknown[] = [];
    await start(
      async (turtle) => {
        results = await Promise.allSettled([
          turtle.ui.prompt({ title: "Name?" }),
          turtle.ui.confirm({ title: "Sure?", message: "Really" }),
        ]);
      },
      {
        services: {
          dialogs: () => ({ prompt, confirm: vi.fn(), form: vi.fn() }) as any,
        },
      },
    );
    await settle(20);
    answer("typed");
    await settle(20);
    expect(prompt).toHaveBeenCalledWith({ title: "Name?" });
    expect(results[0]).toEqual({ status: "fulfilled", value: "typed" });
    expect(results[1]).toMatchObject({ status: "rejected" });
  });

  it("refuses dialogs with bad options", async () => {
    let error: unknown;
    await start(async (turtle) => {
      error = await turtle.ui
        .form({ title: "x", fields: [{ key: "a", type: "colour" } as any] })
        .catch((e) => e);
    });
    await settle();
    expect(String(error)).toContain("Invalid form options");
  });

  it("saves its own data in the project", async () => {
    isUnsaved.set(false);
    await start(async (turtle) => {
      await turtle.project.setData({ notes: ["hi"] });
    });
    await settle();
    expect(get(extraDataStore).plugins["test-plugin"]).toEqual({
      notes: ["hi"],
    });
    expect(get(isUnsaved)).toBe(true);
  });

  it("can add its own steps, but needs permission for anything else", async () => {
    sequenceStore.set([]);
    const outcome: string[] = [];
    await start(async (turtle) => {
      turtle.actions.register({ name: "go", label: "Go" });
      await turtle.project.edit("Add go", [
        { op: "insertStep", index: 0, step: { kind: "plugin", type: "go" } },
      ]);
      outcome.push("own step ok");
      await turtle.project
        .edit("Add wait", [
          { op: "insertStep", index: 0, step: { kind: "wait", durationMs: 5 } },
        ])
        .catch((e) => outcome.push(String(e)));
    });
    await settle(20);
    expect(outcome[0]).toBe("own step ok");
    expect(outcome[1]).toContain('needs the "project.write" permission');
    expect(get(sequenceStore)).toMatchObject([
      { kind: "plugin", type: "test-plugin.go" },
    ]);
  });

  it("can't pick files without the permission", async () => {
    let error: unknown;
    await start(async (turtle) => {
      error = await turtle.files.pickProjects().catch((e) => e);
    });
    await settle();
    expect(String(error)).toContain("files.pick");
  });

  it("passes other notifications to the host", async () => {
    const { services } = await start((turtle) => {
      turtle.ui.toast("hello", "success");
      turtle.playback.seek(3);
    });
    await settle();
    expect(services.handleNotify).toHaveBeenCalledWith(
      expect.anything(),
      "ui.toast",
      ["hello", "success"],
    );
    expect(services.handleNotify).toHaveBeenCalledWith(
      expect.anything(),
      "playback.seek",
      [3],
    );
  });
});

describe("settings and events", () => {
  it("tells the plugin when its settings change", async () => {
    const seen: unknown[] = [];
    let read = () => ({}) as unknown;
    const { plugin } = await start((turtle) => {
      turtle.events.on("settingsChanged", (values) => seen.push(values));
      read = () => turtle.settings.get();
    });
    plugin.settingsChanged({ speed: 3 });
    await settle();
    expect(seen).toEqual([{ speed: 3 }]);
    expect(read()).toEqual({ speed: 3 });
  });

  it("subscribes to playback only while someone listens", async () => {
    let stop = () => {};
    const { plugin } = await start((turtle) => {
      stop = turtle.events.on("playback", () => {}).dispose;
    });
    await settle();
    expect(plugin.subscriptions.has("playback")).toBe(true);
    stop();
    await settle();
    expect(plugin.subscriptions.has("playback")).toBe(false);
  });
});

describe("a plugin that misbehaves", () => {
  it("is paused after repeated bad messages", async () => {
    const { plugin, services, pluginPort } = await start(() => {});
    for (let i = 0; i < 5; i++) pluginPort().postMessage({ type: "nonsense" });
    await settle();
    expect(plugin.state).toBe("paused");
    expect(services.stopped).toHaveBeenCalledWith(plugin);
  });

  it("is paused when it floods the app with messages", async () => {
    const { plugin, pluginPort } = await start(() => {});
    for (let i = 0; i < 2100; i++) {
      pluginPort().postMessage({
        type: "notify",
        method: "subscribe",
        args: ["x", true],
      });
    }
    await settle(50);
    expect(plugin.state).toBe("paused");
  });

  it("can't pollute prototypes through what it sends", async () => {
    await start((turtle) => {
      turtle.commands.register(
        JSON.parse('{"id":"x","label":"X","__proto__":{"polluted":true}}'),
      );
      turtle.field.addLayer({
        draw: () =>
          JSON.parse(
            '[{"type":"circle","x":0,"y":0,"radius":1,"__proto__":{"polluted":true}}]',
          ),
      });
    });
    await settle();
    expect(({} as any).polluted).toBeUndefined();
    expect(Object.keys(get(fieldLayerRegistry)[0].primitives[0])).not.toContain(
      "__proto__",
    );
  });

  it("reports contributions it can't make", async () => {
    const { services } = await start((turtle) => {
      turtle.actions.register({ name: "Bad Name!", label: "x" });
    });
    await settle();
    expect(services.onError).toHaveBeenCalledWith(
      "test-plugin",
      expect.stringContaining("Invalid action type"),
    );
  });

  it("is stopped when it stops answering", async () => {
    const { services } = await start(() => {});
    const silent = new RunningPlugin(
      manifest({ id: "silent" }),
      {
        ...services,
        openSandbox(_plugin, init, onPort) {
          const channel = new MessageChannel();
          const rpc = new Rpc((m) => channel.port2.postMessage(m), {});
          createRuntime(rpc, init());
          onPort(channel.port1);
          // Says it's ready, then never answers anything.
          queueMicrotask(() => rpc.notify("ready"));
          return () => channel.port1.close();
        },
      },
      { everyMs: 10, timeoutMs: 30 },
    );
    await silent.start([], true);
    await settle(100);
    expect(silent.state).toBe("unresponsive");
    expect(services.stopped).toHaveBeenCalledWith(silent);
  });
});
