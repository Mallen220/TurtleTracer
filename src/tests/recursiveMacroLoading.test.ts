// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { loadMacro, macrosStore } from "../lib/projectStore";
import { get } from "svelte/store";

describe("recursiveMacroLoading", () => {
  beforeEach(() => {
    macrosStore.set(new Map());
    vi.clearAllMocks();
  });

  it("should resolve and update nested macro paths recursively", async () => {
    const mockFiles: Record<string, string> = {
      "/abs/macro1.pp": JSON.stringify({
        startPoint: { x: 0, y: 0 },
        lines: [],
        sequence: [
          { kind: "macro", id: "m2", filePath: "macro2.pp", name: "M2" },
        ],
      }),
      "/abs/macro2.pp": JSON.stringify({
        startPoint: { x: 0, y: 0 },
        lines: [],
        sequence: [
          { kind: "macro", id: "m3", filePath: "subdir/macro3.pp", name: "M3" },
        ],
      }),
      "/abs/subdir/macro3.pp": JSON.stringify({
        startPoint: { x: 0, y: 0 },
        lines: [],
        sequence: [],
      }),
    };

    const mockResolvePath = vi.fn((base, relative) => {
      // Simple mock implementation for path resolution
      if (relative.startsWith("/")) return relative; // Already absolute
      const dir = base.substring(0, base.lastIndexOf("/"));
      return `${dir}/${relative}`;
    });

    const mockReadFile = vi.fn((path) => {
      if (mockFiles[path]) return Promise.resolve(mockFiles[path]);
      return Promise.reject(new Error(`File not found: ${path}`));
    });

    // Mock window.electronAPI
    vi.stubGlobal("window", {
      electronAPI: {
        readFile: mockReadFile,
        resolvePath: mockResolvePath,
      },
    });

    await loadMacro("/abs/macro1.pp");

    const macros = get(macrosStore);

    // Check if all macros are loaded
    expect(macros.has("/abs/macro1.pp")).toBe(true);
    expect(macros.has("/abs/macro2.pp")).toBe(true);
    expect(macros.has("/abs/subdir/macro3.pp")).toBe(true);

    // Check if nested paths are updated in the store
    const m1 = macros.get("/abs/macro1.pp");
    const m1_child = m1?.sequence.find((s) => s.kind === "macro");
    expect(m1_child?.filePath).toBe("/abs/macro2.pp");

    const m2 = macros.get("/abs/macro2.pp");
    const m2_child = m2?.sequence.find((s) => s.kind === "macro");
    expect(m2_child?.filePath).toBe("/abs/subdir/macro3.pp");
  });
});
