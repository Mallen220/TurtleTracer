// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, waitFor } from "@testing-library/svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import ExportCodeDialog from "../lib/components/dialogs/ExportCodeDialog.svelte";
import { currentFilePath } from "../stores";
import { linesStore, sequenceStore } from "../lib/projectStore";

describe("ExportCodeDialog project data preview", () => {
  const originalElectronAPI = (globalThis as any).electronAPI;

  beforeEach(() => {
    (globalThis as any).electronAPI = {
      readFile: vi.fn().mockResolvedValue('{"stale": "saved copy"}'),
      makeRelativePath: vi.fn(async (_base: string, p: string) =>
        p.replace("/project/", ""),
      ),
    };
    currentFilePath.set(null);
    linesStore.set([
      {
        id: "line-1",
        name: "Unsaved Edit",
        endPoint: { x: 10, y: 20, heading: "tangential", reverse: false },
        controlPoints: [],
        color: "#fff",
      } as any,
    ]);
    sequenceStore.set([]);
  });

  afterEach(() => {
    (globalThis as any).electronAPI = originalElectronAPI;
  });

  const openJson = async () => {
    const view = render(ExportCodeDialog, {
      isOpen: false,
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 } as any,
      lines: [],
      sequence: [],
      shapes: [],
    });
    await view.component.openWithFormat("json");
    return view;
  };

  it("shows the current project, not the last saved file", async () => {
    currentFilePath.set("/project/auto.turt");
    const { getByText } = await openJson();

    await waitFor(() => expect(getByText(/"Unsaved Edit"/)).toBeTruthy());
    expect((globalThis as any).electronAPI.readFile).not.toHaveBeenCalled();
  });

  it("matches what saving writes", async () => {
    currentFilePath.set("/project/auto.turt");
    sequenceStore.set([
      { kind: "macro", id: "m1", name: "M", filePath: "/project/other.turt" },
    ] as any);
    const { getByText } = await openJson();

    // Macro paths are stored relative to the project file.
    await waitFor(() => expect(getByText(/"other.turt"/)).toBeTruthy());
    expect(getByText(/"version"/)).toBeTruthy();
  });

  it("lists every path in the sequence when it's empty", async () => {
    const { container } = await openJson();

    await waitFor(() =>
      expect(container.textContent).toMatch(/"lineId":\s*"line-1"/),
    );
  });
});
