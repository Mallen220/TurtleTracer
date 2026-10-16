// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Plugin steps in projects, timing and exports, with and without their plugin.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { get } from "svelte/store";
import { actionFor, actionRegistry } from "../../lib/actionRegistry";
import {
  defaultsFor,
  missingPluginAction,
  pluginOfType,
} from "../../lib/actions/PluginStepAction";
import { registerCoreUI } from "../../lib/coreRegistrations";
import { calculatePathTime } from "../../utils/timeCalculator";
import { generateSequentialCommandCode } from "../../lib/exporters/sequentialExporter";
import { generateJavaCode } from "../../lib/exporters/javaExporter";
import { createRegistry } from "../../lib/registries";
import { sanitizeSequence } from "../../lib/projectStore";
import { DEFAULT_SETTINGS } from "../../config/defaults";
import type { Line, SequenceItem } from "../../types";

beforeAll(registerCoreUI);
afterEach(() => actionRegistry.unregister("demo.beep"));

const lines: Line[] = [
  {
    id: "a",
    name: "",
    endPoint: { x: 40, y: 10, heading: "tangential", reverse: false },
    controlPoints: [],
    color: "#000",
  },
];
const start = { x: 10, y: 10, heading: "tangential" as const, reverse: false };
const step: SequenceItem = {
  kind: "plugin",
  id: "s1",
  type: "demo.beep",
  name: "Beep",
  data: { loud: true },
};
const sequence: SequenceItem[] = [{ kind: "path", lineId: "a" }, step];

describe("steps whose plugin isn't there", () => {
  it("get a stand-in that keeps them", () => {
    expect(actionFor(step)).toBe(missingPluginAction);
    expect(
      actionFor({ kind: "wait", id: "w", name: "", durationMs: 1 })?.kind,
    ).toBe("wait");
    expect(pluginOfType("demo.beep")).toBe("demo");
  });

  it("survive loading, take no time, and export as a note", async () => {
    expect(sanitizeSequence(lines, sequence)).toContainEqual(step);
    const plain = calculatePathTime(start, lines, DEFAULT_SETTINGS as any, [
      sequence[0],
    ]);
    const withStep = calculatePathTime(
      start,
      lines,
      DEFAULT_SETTINGS as any,
      sequence,
    );
    expect(withStep.totalTime).toBeCloseTo(plain.totalTime);

    const sequential = await generateSequentialCommandCode(
      start,
      lines,
      "Auto",
      sequence,
    );
    expect(sequential).toContain("needs the demo plugin");
    const java = await generateJavaCode(start, lines, true, sequence);
    expect(java).toContain("needs the demo plugin");
  });
});

describe("steps whose plugin is on", () => {
  it("are timed and exported by their action", async () => {
    actionRegistry.register({
      kind: "demo.beep",
      owner: "demo",
      label: "Beep",
      component: null,
      calculateTime: (item, ctx) => ({
        events: [
          {
            type: "wait",
            duration: 1,
            startTime: ctx.currentTime,
            endTime: ctx.currentTime + 1,
            waitId: (item as { id: string }).id,
          },
        ],
        duration: 1,
      }),
      prepareCode: async () => {},
      toSequentialCommand: () => "new Beep()",
    });
    const plain = calculatePathTime(start, lines, DEFAULT_SETTINGS as any, [
      sequence[0],
    ]);
    const withStep = calculatePathTime(
      start,
      lines,
      DEFAULT_SETTINGS as any,
      sequence,
    );
    expect(withStep.totalTime).toBeCloseTo(plain.totalTime + 1);
    expect(
      await generateSequentialCommandCode(start, lines, "Auto", sequence),
    ).toContain("new Beep()");
    expect(Object.keys(get(actionRegistry))).toContain("demo.beep");
  });
});

describe("defaultsFor", () => {
  it("gives each field its default, or a sensible empty value", () => {
    expect(
      defaultsFor([
        { key: "a", type: "number", label: "A", default: 3 },
        { key: "b", type: "number", label: "B", min: 2 },
        { key: "c", type: "toggle", label: "C" },
        {
          key: "d",
          type: "select",
          label: "D",
          options: [{ value: "x", label: "X" }],
        },
        { key: "e", type: "text", label: "E" },
      ]),
    ).toEqual({ a: 3, b: 2, c: false, d: "x", e: "" });
  });
});

describe("registries", () => {
  it("remove one owner's entries and leave the rest", () => {
    const registry = createRegistry<{
      id: string;
      owner?: string;
      order?: number;
    }>((a, b) => (a.order ?? 0) - (b.order ?? 0));
    registry.register({ id: "core", order: 2 });
    registry.register({ id: "p1", owner: "p", order: 1 });
    registry.register({ id: "q1", owner: "q", order: 3 });
    expect(registry.getAll().map((e) => e.id)).toEqual(["p1", "core", "q1"]);
    registry.removeOwner("p");
    expect(registry.getAll().map((e) => e.id)).toEqual(["core", "q1"]);
    registry.register({ id: "core", order: 9 });
    expect(registry.getAll()).toHaveLength(2);
  });
});
