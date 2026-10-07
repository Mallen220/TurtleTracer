// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { get } from "svelte/store";
import {
  normalizeLines,
  sanitizeSequence,
  renumberDefaultPathNames,
  resetProject,
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
  extraDataStore,
  macrosStore,
  scaleShapesToField,
  loadProjectData,
  loadMacro,
  updateMacroContent,
  refreshMacros,
  ensureSequenceConsistency,
} from "../lib/projectStore";
import { notification, currentFilePath } from "../stores";
import { hookRegistry } from "../lib/registries";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { getDefaultStartPoint } from "../config";
import type {
  Line,
  SequenceItem,
  SequencePathItem,
  SequenceWaitItem,
} from "../types";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";

beforeEach(() => {
  actionRegistry.reset();
  registerCoreUI();
});

const pathKind = (): SequencePathItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isPath)
    ?.kind as SequencePathItem["kind"]) ?? "path";
const waitKind = (): SequenceWaitItem["kind"] =>
  (actionRegistry.getAll().find((a) => a.isWait)
    ?.kind as SequenceWaitItem["kind"]) ?? "wait";

describe("projectStore Utilities", () => {
  describe("normalizeLines", () => {
    it("should assign IDs if missing", () => {
      const input: Partial<Line>[] = [{ name: "Test" }];
      const output = normalizeLines(input as Line[]);
      expect(output[0].id).toBeDefined();
      expect(output[0].name).toBe("Test");
    });

    it("should initialize default properties", () => {
      const input: Partial<Line>[] = [{ id: "1" }];
      const output = normalizeLines(input as Line[]);
      expect(output[0].controlPoints).toEqual([]);
      expect(output[0].eventMarkers).toEqual([]);
      expect(output[0].color).toBeDefined();
    });

    it("should handle wait times", () => {
      const input: any[] = [
        { id: "1", waitBeforeMs: 100, waitAfterMs: 200 },
        {
          id: "2",
          waitBefore: { durationMs: 300 },
          waitAfter: { durationMs: 400 },
        },
      ];
      const output = normalizeLines(input);
      expect(output[0].waitBeforeMs).toBe(100);
      expect(output[0].waitAfterMs).toBe(200);
      expect(output[1].waitBeforeMs).toBe(300);
      expect(output[1].waitAfterMs).toBe(400);
    });
  });

  describe("sanitizeSequence", () => {
    const lines: Line[] = [
      { id: "l1", name: "Line 1" } as Line,
      { id: "l2", name: "Line 2" } as Line,
    ];

    it("should remove sequence items referring to non-existent lines", () => {
      const seq: SequenceItem[] = [
        { kind: pathKind(), lineId: "l1" },
        { kind: pathKind(), lineId: "missing" } as any,
      ];
      const result = sanitizeSequence(lines, seq);
      expect(result).toHaveLength(2); // l1 is kept, missing is removed, but then l2 is appended because it's missing from sequence
      // Wait, let's trace logic:
      // pruned = [l1]
      // missing = [l2]
      // result = [l1, l2]

      const ids = result.map((s: any) => s.lineId);
      expect(ids).toContain("l1");
      expect(ids).toContain("l2");
      expect(ids).not.toContain("missing");
    });

    it("should append missing lines to sequence", () => {
      const seq: SequenceItem[] = [{ kind: pathKind(), lineId: "l1" }];
      const result = sanitizeSequence(lines, seq);
      expect(result).toHaveLength(2);
      expect((result[1] as SequencePathItem).lineId).toBe("l2");
    });

    it("should preserve wait items", () => {
      const seq: SequenceItem[] = [
        { kind: pathKind(), lineId: "l1" },
        { kind: waitKind(), durationMs: 1000 } as any,
      ];
      const result = sanitizeSequence(lines, seq);
      // pruned = [l1, wait]
      // missing = [l2]
      // result = [l1, wait, l2]
      expect(result).toHaveLength(3);
      expect(result[1].kind).toBe(waitKind());
    });
  });

  describe("renumberDefaultPathNames", () => {
    it("should renumber 'Path N' names", () => {
      const lines: Line[] = [
        { name: "Path 1" } as Line,
        { name: "Custom" } as Line,
        { name: "Path 5" } as Line,
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("Path 1");
      expect(result[1].name).toBe("Custom");
      expect(result[2].name).toBe("Path 3"); // Should be renumbered based on index + 1
    });

    it("should ignore custom names", () => {
      const lines: Line[] = [
        { name: "Start" } as Line,
        { name: "End" } as Line,
      ];
      const result = renumberDefaultPathNames(lines);
      expect(result[0].name).toBe("Start");
      expect(result[1].name).toBe("End");
    });
  });
});

describe("resetProject", () => {
  it("restores the default path and clears project data", () => {
    linesStore.set([]);
    shapesStore.set([]);
    extraDataStore.set({ plugin: { value: 1 } });

    resetProject();

    const lines = get(linesStore);
    expect(get(startPointStore)).toEqual(getDefaultStartPoint());
    expect(lines.length).toBeGreaterThan(0);
    expect(get(sequenceStore)).toEqual(
      lines.map((l) => ({ kind: "path", lineId: l.id })),
    );
    expect(get(extraDataStore)).toEqual({});
  });
});

// --- Loading projects and macros ---

const pointTo = (x: number, y: number) =>
  ({ x, y, heading: "tangential", reverse: false }) as any;

const plainLine = (id: string, x: number, over: Partial<Line> = {}): Line => ({
  id,
  endPoint: pointTo(x, 0),
  controlPoints: [],
  color: "red",
  ...over,
});

const macroFileData = (lines: Line[], sequence?: SequenceItem[]) => ({
  startPoint: pointTo(0, 0),
  lines,
  shapes: [],
  sequence: sequence ?? lines.map((l) => ({ kind: "path", lineId: l.id })),
});

describe("scaleShapesToField", () => {
  const shapes = [
    {
      id: "s",
      name: "box",
      vertices: [
        { x: 10, y: 20 },
        { x: 30, y: 40 },
      ],
      color: "#000",
      fillColor: "#000",
    },
  ] as any[];

  it("leaves the shapes alone on the standard field", () => {
    expect(scaleShapesToField(shapes, { ...DEFAULT_SETTINGS })).toBe(shapes);
  });

  it("stretches them to a different sized field", () => {
    const scaled = scaleShapesToField(shapes, {
      ...DEFAULT_SETTINGS,
      fieldWidth: 288,
      fieldHeight: 72,
    });
    expect(scaled[0].vertices).toEqual([
      { x: 20, y: 10 },
      { x: 60, y: 20 },
    ]);
    // The originals aren't modified.
    expect(shapes[0].vertices[0]).toEqual({ x: 10, y: 20 });
  });

  it("doesn't touch shapes on a custom map, whatever its size", () => {
    const scaled = scaleShapesToField(shapes, {
      ...DEFAULT_SETTINGS,
      fieldWidth: 288,
      fieldMap: "mine",
      customMaps: [{ id: "mine" } as any],
    });
    expect(scaled).toBe(shapes);
  });
});

describe("loadProjectData", () => {
  const api = {
    readFile: vi.fn(),
    resolvePath: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    (globalThis as any).electronAPI = api;
    notification.set(null);
    macrosStore.set(new Map());
    startPointStore.set(pointTo(1, 1));
    linesStore.set([]);
    sequenceStore.set([]);
  });
  afterEach(() => {
    delete (globalThis as any).electronAPI;
    hookRegistry.reset();
    vi.restoreAllMocks();
  });

  it("starts from the middle of the field if the file has no start point", async () => {
    await loadProjectData({ lines: [plainLine("a", 10)] });
    expect(get(startPointStore)).toMatchObject({
      x: 72,
      y: 72,
      heading: "tangential",
    });
  });

  it("lets plugins change the data before it is loaded", async () => {
    hookRegistry.register("onLoad", (data: any) => {
      data.lines = [plainLine("from-plugin", 5)];
    });
    await loadProjectData({ lines: [plainLine("a", 10)] });
    expect(get(linesStore).map((l) => l.id)).toEqual(["from-plugin"]);
  });

  it("removes the ' (2)' suffix that was added to keep linked names unique", async () => {
    await loadProjectData({
      startPoint: pointTo(0, 0),
      lines: [
        plainLine("a", 10, {
          name: "Score (2)",
          waitBeforeName: "Grab (3)",
          waitAfterName: "Drop",
        }),
        plainLine("b", 20, {
          name: "Renamed",
          _linkedName: "Shared (4)",
        } as any),
      ],
      sequence: [
        { kind: "path", lineId: "a" },
        {
          kind: "wait",
          id: "w",
          name: "Hold (2)",
          durationMs: 1,
          _linkedName: "Pause (5)",
        },
      ],
    });
    const [a, b] = get(linesStore);
    expect(a).toMatchObject({
      name: "Score",
      waitBeforeName: "Grab",
      waitAfterName: "Drop",
    });
    // The saved linked name wins over the displayed one.
    expect(b.name).toBe("Shared");
    expect((get(sequenceStore)[1] as any).name).toBe("Pause");
  });

  it("builds the sequence from the lines when the file has none", async () => {
    await loadProjectData({
      startPoint: pointTo(0, 0),
      lines: [plainLine("a", 10), plainLine("b", 20)],
    });
    expect(get(sequenceStore)).toEqual([
      expect.objectContaining({ kind: "path", lineId: "a" }),
      expect.objectContaining({ kind: "path", lineId: "b" }),
    ]);
  });

  it("repairs a sequence that mentions missing paths or leaves some out", async () => {
    await loadProjectData({
      startPoint: pointTo(0, 0),
      lines: [plainLine("a", 10), plainLine("b", 20)],
      sequence: [
        { kind: "path", lineId: "ghost" },
        { kind: "path", lineId: "a" },
      ],
    });
    expect((get(sequenceStore) as any[]).map((s) => s.lineId)).toEqual([
      "a",
      "b",
    ]);
  });

  it("numbers default path names in order and defaults shapes and extra data", async () => {
    await loadProjectData({
      startPoint: pointTo(0, 0),
      lines: [
        plainLine("a", 10, { name: "Path 7" }),
        plainLine("b", 20, { name: "Path 9" }),
        plainLine("c", 30, { name: "Custom" }),
      ],
    });
    expect(get(linesStore).map((l) => l.name)).toEqual([
      "Path 1",
      "Path 2",
      "Custom",
    ]);
    expect(get(shapesStore)).toEqual([]);
    expect(get(extraDataStore)).toEqual({});
  });

  describe("macros", () => {
    const macroStep = (filePath: string): SequenceItem => ({
      kind: "macro",
      id: "m1",
      name: "Macro",
      filePath,
    });

    it("loads macros relative to the project file and uses the resolved path", async () => {
      api.resolvePath.mockResolvedValue("/abs/macros/m.turt");
      api.readFile.mockResolvedValue(
        JSON.stringify(macroFileData([plainLine("x", 30)])),
      );

      await loadProjectData(
        {
          startPoint: pointTo(0, 0),
          lines: [],
          sequence: [macroStep("macros/m.turt")],
        },
        "/abs/project.turt",
      );

      expect(api.resolvePath).toHaveBeenCalledWith(
        "/abs/project.turt",
        "macros/m.turt",
      );
      expect(get(macrosStore).has("/abs/macros/m.turt")).toBe(true);
      expect((get(sequenceStore)[0] as any).filePath).toBe(
        "/abs/macros/m.turt",
      );
      // The macro's lines are expanded into the project.
      expect(get(linesStore).some((l) => l.isMacroElement)).toBe(true);
    });

    it("warns when a macro path can't be resolved", async () => {
      api.resolvePath.mockResolvedValue("");
      await loadProjectData(
        {
          startPoint: pointTo(0, 0),
          lines: [],
          sequence: [macroStep("gone.turt")],
        },
        "/abs/project.turt",
      );
      expect(get(notification)).toMatchObject({ type: "warning" });
      expect(get(notification)!.message).toContain("gone.turt");
    });

    it("warns when resolving throws, and still loads the rest of the project", async () => {
      api.resolvePath.mockRejectedValue(new Error("boom"));
      await loadProjectData(
        {
          startPoint: pointTo(0, 0),
          lines: [plainLine("a", 10)],
          sequence: [macroStep("x.turt"), { kind: "path", lineId: "a" }],
        },
        "/abs/project.turt",
      );
      expect(get(notification)!.message).toContain(
        "Failed to resolve macro path",
      );
      expect(get(linesStore).map((l) => l.id)).toContain("a");
    });

    it("loads macros by the stored path when there is no project file", async () => {
      api.readFile.mockResolvedValue(
        JSON.stringify(macroFileData([plainLine("x", 30)])),
      );
      await loadProjectData({
        startPoint: pointTo(0, 0),
        lines: [],
        sequence: [macroStep("/abs/m.turt")],
      });
      expect(api.readFile).toHaveBeenCalledWith("/abs/m.turt");
      expect(get(macrosStore).has("/abs/m.turt")).toBe(true);
    });
  });
});

describe("loadMacro", () => {
  const api = { readFile: vi.fn(), resolvePath: vi.fn() };
  const files: Record<string, unknown> = {};

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    for (const k of Object.keys(files)) delete files[k];
    api.readFile.mockImplementation(async (path: string) => {
      if (!(path in files)) throw new Error("ENOENT");
      return JSON.stringify(files[path]);
    });
    api.resolvePath.mockImplementation(async (from: string, rel: string) =>
      rel.startsWith("/")
        ? rel
        : `${from.slice(0, from.lastIndexOf("/"))}/${rel}`,
    );
    (globalThis as any).electronAPI = api;
    notification.set(null);
    macrosStore.set(new Map());
    linesStore.set([]);
    sequenceStore.set([]);
  });
  afterEach(() => {
    delete (globalThis as any).electronAPI;
    vi.restoreAllMocks();
  });

  it("reads a macro once, then uses the loaded copy unless forced", async () => {
    files["/m.turt"] = macroFileData([plainLine("x", 10)]);
    await loadMacro("/m.turt");
    await loadMacro("/m.turt");
    expect(api.readFile).toHaveBeenCalledTimes(1);
    await loadMacro("/m.turt", true);
    expect(api.readFile).toHaveBeenCalledTimes(2);
  });

  it("normalises the macro's lines as it stores them", async () => {
    files["/m.turt"] = macroFileData([{ endPoint: pointTo(5, 5) } as any]);
    await loadMacro("/m.turt");
    const [line] = get(macrosStore).get("/m.turt")!.lines;
    expect(line.id).toBeTruthy();
    expect(line.controlPoints).toEqual([]);
    expect(line.waitBeforeMs).toBe(0);
  });

  it("ignores a file that isn't a project", async () => {
    files["/m.turt"] = { hello: "world" };
    await loadMacro("/m.turt");
    expect(get(macrosStore).has("/m.turt")).toBe(false);
  });

  it("warns when the file is missing", async () => {
    await loadMacro("/missing.turt");
    expect(get(notification)).toMatchObject({ type: "warning" });
    expect(get(notification)!.message).toContain("/missing.turt");
  });

  it("loads macros nested inside it, relative to the macro's own folder", async () => {
    files["/dir/outer.turt"] = macroFileData(
      [],
      [{ kind: "macro", id: "n", name: "Inner", filePath: "inner.turt" }],
    );
    files["/dir/inner.turt"] = macroFileData([plainLine("x", 10)]);
    await loadMacro("/dir/outer.turt");
    expect([...get(macrosStore).keys()].sort()).toEqual([
      "/dir/inner.turt",
      "/dir/outer.turt",
    ]);
  });

  it("copes with two macros that include each other", async () => {
    files["/a.turt"] = macroFileData(
      [],
      [{ kind: "macro", id: "m", name: "B", filePath: "/b.turt" }],
    );
    files["/b.turt"] = macroFileData(
      [],
      [{ kind: "macro", id: "m", name: "A", filePath: "/a.turt" }],
    );
    await loadMacro("/a.turt");
    expect(api.readFile).toHaveBeenCalledTimes(2);
    expect(get(macrosStore).size).toBe(2);
  });

  it("does nothing without a way to read files", async () => {
    (globalThis as any).electronAPI = {};
    await loadMacro("/m.turt");
    expect(get(macrosStore).size).toBe(0);
  });
});

describe("macros in the open project", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    notification.set(null);
    currentFilePath.set("");
    macrosStore.set(new Map());
    startPointStore.set(pointTo(0, 0));
    linesStore.set([plainLine("u", 10)]);
    sequenceStore.set([{ kind: "path", lineId: "u" }]);
  });
  afterEach(() => vi.restoreAllMocks());

  const withMacroStep = () =>
    sequenceStore.set([
      { kind: "path", lineId: "u" },
      { kind: "macro", id: "m", name: "M", filePath: "/m.turt" },
    ]);

  it("refreshMacros does nothing for a project with no macros", () => {
    const before = get(linesStore);
    refreshMacros();
    expect(get(linesStore)).toBe(before);
  });

  it("updateMacroContent stores the macro and expands it into the project", () => {
    withMacroStep();
    updateMacroContent(
      "/m.turt",
      macroFileData([{ endPoint: pointTo(40, 0) } as any]) as any,
    );
    const lines = get(linesStore);
    expect(lines.filter((l) => l.isMacroElement).length).toBeGreaterThan(0);
    expect(lines.find((l) => l.id === "u")).toBeTruthy();
    expect(get(macrosStore).get("/m.turt")!.lines[0].id).toBeTruthy();
  });

  it("drops the lines of a macro that was removed from the sequence", () => {
    withMacroStep();
    updateMacroContent("/m.turt", macroFileData([plainLine("x", 40)]) as any);
    expect(get(linesStore).some((l) => l.isMacroElement)).toBe(true);
    sequenceStore.set([{ kind: "path", lineId: "u" }]);
    refreshMacros();
    expect(get(linesStore).map((l) => l.id)).toEqual(["u"]);
  });

  it("reports an error instead of crashing when a macro includes the open file", () => {
    withMacroStep();
    currentFilePath.set("/M.turt");
    updateMacroContent("/m.turt", macroFileData([plainLine("x", 40)]) as any);
    expect(get(notification)).toMatchObject({ type: "error" });
    expect(get(notification)!.message).toContain("Macro Error");
  });
});

describe("ensureSequenceConsistency", () => {
  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => vi.restoreAllMocks());

  it("repairs the sequence and path names in place", () => {
    linesStore.set([
      plainLine("a", 10, { name: "Path 4" }),
      plainLine("b", 20, { name: "Path 9" }),
    ]);
    sequenceStore.set([
      { kind: "path", lineId: "ghost" },
      { kind: "path", lineId: "b" },
    ]);
    ensureSequenceConsistency();
    expect((get(sequenceStore) as any[]).map((s) => s.lineId)).toEqual([
      "b",
      "a",
    ]);
    expect(get(linesStore).map((l) => l.name)).toEqual(["Path 1", "Path 2"]);
  });

  it("leaves a consistent project untouched", () => {
    const lines = [plainLine("a", 10, { name: "Path 1" })];
    const sequence: SequenceItem[] = [
      { kind: "path", lineId: "a", isChain: undefined },
    ];
    linesStore.set(lines);
    sequenceStore.set(sequence);
    ensureSequenceConsistency();
    expect(get(linesStore)).toBe(lines);
    expect(get(sequenceStore)).toBe(sequence);
    expect(console.warn).not.toHaveBeenCalled();
  });
});
