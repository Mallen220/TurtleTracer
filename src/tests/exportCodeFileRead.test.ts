// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, waitFor } from "@testing-library/svelte";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import ExportCodeDialog from "../lib/components/dialogs/ExportCodeDialog.svelte";
import { currentFilePath } from "../stores";

vi.mock("../utils", () => {
  return {
    relativizeSequenceForPreview: vi.fn((seq) => seq),
    getRandomColor: vi.fn(() => "#ffffff"),
  };
});

// Mock the exporters module
vi.mock("../lib/exporters", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    exporterRegistry: {
      subscribe: vi.fn((fn) => {
        fn({});
        return () => {};
      }),
      register: vi.fn(),
    },
  };
});

describe("ExportCodeDialog file reading", () => {
  const originalElectronAPI = (window as any).electronAPI;

  beforeEach(() => {
    (window as any).electronAPI = {
      readFile: vi
        .fn()
        .mockResolvedValue('{"mocked": "json content from file"}'),
      makeRelativePath: vi.fn(),
      showSaveDialog: vi.fn(),
      writeFile: vi.fn(),
    };
    currentFilePath.set(null);
  });

  afterEach(() => {
    (window as any).electronAPI = originalElectronAPI;
  });

  const createDialog = () =>
    render(ExportCodeDialog, {
      isOpen: false,
      startPoint: { x: 0, y: 0, heading: "constant", degrees: 0 } as any,
      lines: [],
      sequence: [],
      shapes: [],
    });

  it("reads file content when exporting JSON if file path exists", async () => {
    currentFilePath.set("/path/to/project.pp");
    const { getByText, component } = createDialog();

    // Open with JSON format
    await component.openWithFormat("json");

    // Wait for the async operation
    await waitFor(() => {
      expect((window as any).electronAPI.readFile).toHaveBeenCalledWith(
        "/path/to/project.pp",
      );
    });

    // Check if the content is displayed
    await waitFor(() => expect(getByText(/"mocked"/)).toBeTruthy());
    await waitFor(() =>
      expect(getByText(/"json content from file"/)).toBeTruthy(),
    );
  });

  const testFallbackGeneration = async (
    setupMock: () => void,
    expectReadFileCall: boolean,
  ) => {
    setupMock();
    const { getByText, component } = createDialog();

    await component.openWithFormat("json");

    await waitFor(() => {
      if (expectReadFileCall) {
        expect((window as any).electronAPI.readFile).toHaveBeenCalled();
      } else {
        expect((window as any).electronAPI.readFile).not.toHaveBeenCalled();
      }
    });

    // Should contain generated content
    await waitFor(() => expect(getByText(/"version"/)).toBeTruthy());
  };

  it("falls back to generation if file read fails", async () => {
    const mockConsoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => {});

    await testFallbackGeneration(() => {
      currentFilePath.set("/path/to/project.pp");
      (window as any).electronAPI.readFile.mockRejectedValue(
        new Error("File not found"),
      );
    }, true);

    mockConsoleWarn.mockRestore();
  });

  it("generates content if no file path", async () => {
    await testFallbackGeneration(() => {
      currentFilePath.set(null);
    }, false);
  });
});
