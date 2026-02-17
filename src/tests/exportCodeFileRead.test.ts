// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, fireEvent, waitFor } from "@testing-library/svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import ExportCodeDialog from "../lib/components/dialogs/ExportCodeDialog.svelte";
import { currentFilePath } from "../stores";
import { get } from "svelte/store";

// Mock the utils module
vi.mock("../utils", () => {
  return {
    generateJavaCode: vi.fn(),
    generatePointsArray: vi.fn(() => "mocked points"),
    generateSequentialCommandCode: vi.fn(),
    relativizeSequenceForPreview: vi.fn((seq) => seq),
    getRandomColor: vi.fn(() => "#ffffff"),
  };
});

describe("ExportCodeDialog file reading", () => {
  const originalElectronAPI = (window as any).electronAPI;

  beforeEach(() => {
    (window as any).electronAPI = {
        readFile: vi.fn().mockResolvedValue('{"mocked": "json content from file"}'),
        makeRelativePath: vi.fn(),
        showSaveDialog: vi.fn(),
        writeFile: vi.fn(),
    };
    currentFilePath.set(null);
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  it("reads file content when exporting JSON if file path exists", async () => {
    currentFilePath.set("/path/to/project.pp");

    const { getByText, component } = render(ExportCodeDialog, {
        isOpen: false,
        startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 } as any,
        lines: [],
        sequence: [],
        shapes: [],
    });

    // Open with JSON format
    await component.openWithFormat("json");

    // Wait for the async operation
    await waitFor(() => {
        expect((window as any).electronAPI.readFile).toHaveBeenCalledWith("/path/to/project.pp");
    });

    // Check if the content is displayed
    // The content is stringified JSON
    // The dialog displays it in Highlight component.
    // We can check if "mocked" text is present.
    await waitFor(() => expect(getByText(/"mocked"/)).toBeTruthy());
    await waitFor(() => expect(getByText(/"json content from file"/)).toBeTruthy());
  });

  it("falls back to generation if file read fails", async () => {
    currentFilePath.set("/path/to/project.pp");
    (window as any).electronAPI.readFile.mockRejectedValue(new Error("File not found"));

    const { getByText, component } = render(ExportCodeDialog, {
        isOpen: false,
        startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 } as any,
        lines: [],
        sequence: [],
        shapes: [],
    });

    await component.openWithFormat("json");

    await waitFor(() => {
         expect((window as any).electronAPI.readFile).toHaveBeenCalled();
    });

    // Should contain generated content (e.g. "version")
    await waitFor(() => expect(getByText(/"version"/)).toBeTruthy());
  });

  it("generates content if no file path", async () => {
    currentFilePath.set(null);

    const { getByText, component } = render(ExportCodeDialog, {
        isOpen: false,
        startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 } as any,
        lines: [],
        sequence: [],
        shapes: [],
    });

    await component.openWithFormat("json");

    await waitFor(() => {
         expect((window as any).electronAPI.readFile).not.toHaveBeenCalled();
    });

    // Should contain generated content
    await waitFor(() => expect(getByText(/"version"/)).toBeTruthy());
  });
});
