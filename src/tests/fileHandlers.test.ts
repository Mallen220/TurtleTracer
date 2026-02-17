// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";
import * as fileHandlers from "../utils/fileHandlers";
import {
  currentFilePath,
  projectMetadataStore,
  isUnsaved,
  notification,
} from "../stores";
import {
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
  settingsStore,
} from "../lib/projectStore";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequenceMacroItem } from "../types";
import pkg from "../../package.json";

const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

// Mock Svelte stores
vi.mock("../stores", async () => {
  const { writable } = await import("svelte/store");
  return {
    currentFilePath: writable(""),
    isUnsaved: writable(false),
    notification: writable(null),
    projectMetadataStore: writable({}),
    currentDirectoryStore: writable(null),
  };
});

describe("fileHandlers", () => {
  const mockElectronAPI = {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    fileExists: vi.fn(),
    saveFile: vi.fn(),
    showSaveDialog: vi.fn(),
    getSavedDirectory: vi.fn(),
    copyFile: vi.fn(),
    makeRelativePath: vi.fn(),
    resolvePath: vi.fn(),
  };

  beforeEach(() => {
    // Ensure core actions are available for tests that inspect kinds
    actionRegistry.reset();
    registerCoreUI();

    // Don't replace the entire window object, just extend it
    (window as any).electronAPI = mockElectronAPI;

    vi.stubGlobal("alert", vi.fn());
    vi.stubGlobal("confirm", vi.fn());
    vi.clearAllMocks();

    // Reset stores
    currentFilePath.set("");
    settingsStore.set({ ...DEFAULT_SETTINGS, recentFiles: [] });
    linesStore.set([]);
    sequenceStore.set([]);
  });

  describe("loadProjectData", () => {
    it("restores linked names by stripping suffixes", async () => {
      const data = {
        lines: [
          {
            id: "1",
            name: "MyPath",
            startPoint: { x: 0, y: 0 },
            endPoint: { x: 10, y: 10 },
          },
          {
            id: "2",
            name: "MyPath (2)",
            startPoint: { x: 10, y: 10 },
            endPoint: { x: 20, y: 20 },
          },
        ],
        sequence: [],
      };

      await fileHandlers.loadProjectData(data);
      const lines = get(linesStore);

      expect(lines[0].name).toBe("MyPath");
      expect(lines[1].name).toBe("MyPath"); // Suffix stripped
    });

    it("restores linked names from _linkedName metadata", async () => {
      const data = {
        lines: [
          { id: "1", name: "Unique Name 1", _linkedName: "Shared Name" },
          { id: "2", name: "Unique Name 2", _linkedName: "Shared Name" },
        ],
        sequence: [],
      };

      await fileHandlers.loadProjectData(data);
      const lines = get(linesStore);

      expect(lines[0].name).toBe("Shared Name");
      expect(lines[1].name).toBe("Shared Name");
    });

    it("resolves relative macro paths using resolvePath", async () => {
      const data = {
        lines: [],
        sequence: [
          {
            kind: macroKind(),
            filePath: "relative/path/macro.pp",
            name: "Macro",
            id: "1",
          },
        ],
      };

      mockElectronAPI.resolvePath.mockImplementation((base, relative) => {
        return "/resolved/" + relative;
      });

      // We need to mock loadMacro to verify it gets the resolved path
      // But loadMacro is internal to projectStore.
      // However, loadProjectData calls loadMacro, which calls electronAPI.readFile.
      // So checking resolvePath call is enough to verify resolution logic trigger.
      // And we can check if readFile is called with resolved path if we want deep verification.

      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify({ lines: [] }));

      await fileHandlers.loadProjectData(data, "/project/base/path.pp");

      expect(mockElectronAPI.resolvePath).toHaveBeenCalledWith(
        "/project/base/path.pp",
        "relative/path/macro.pp",
      );

      // Also verify readFile is called with the resolved path
      expect(mockElectronAPI.readFile).toHaveBeenCalledWith(
        "/resolved/relative/path/macro.pp",
      );

      // Verify sequenceStore has absolute path
      const seq = get(sequenceStore);
      expect((seq[0] as any).filePath).toBe("/resolved/relative/path/macro.pp");
    });
  });

  describe("loadRecentFile", () => {
    it("should alert if electronAPI is missing", async () => {
      delete (window as any).electronAPI;
      const { loadRecentFile } = await import("../utils/fileHandlers");
      const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

      await loadRecentFile("test.pp");
      expect(alertMock).toHaveBeenCalledWith(
        "Cannot load files in this environment",
      );
    });

    it("loads file if it exists", async () => {
      mockElectronAPI.fileExists.mockResolvedValue(true);
      mockElectronAPI.readFile.mockResolvedValue(
        JSON.stringify({ lines: [], sequence: [] }),
      );

      await fileHandlers.loadRecentFile("/path/to/file.pp");

      expect(mockElectronAPI.readFile).toHaveBeenCalledWith("/path/to/file.pp");
      expect(get(currentFilePath)).toBe("/path/to/file.pp");
    });

    it("removes file from recent list if it does not exist and user confirms", async () => {
      // Setup
      mockElectronAPI.fileExists.mockResolvedValue(false);
      const confirmMock = vi.fn().mockReturnValue(true);
      vi.stubGlobal("confirm", confirmMock);

      // Initialize store
      settingsStore.set({
        ...DEFAULT_SETTINGS,
        recentFiles: ["/path/to/file.pp", "/other.pp"],
      });

      // Act
      await fileHandlers.loadRecentFile("/path/to/file.pp");

      // Verify confirm was called
      expect(confirmMock).toHaveBeenCalled();

      // Assert removal
      const currentFiles = get(settingsStore).recentFiles;
      expect(currentFiles).not.toContain("/path/to/file.pp");
      expect(currentFiles).toContain("/other.pp");
    });
  });

  describe("saveProject", () => {
    it("uses saveFile API when available", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.pp");
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: "/saved/file.pp",
      });
      // Ensure we have some data
      linesStore.set([{ id: "1", name: "Line 1" } as any]);

      await fileHandlers.saveProject();

      expect(mockElectronAPI.saveFile).toHaveBeenCalled();
      expect(get(currentFilePath)).toBe("/saved/file.pp");
      expect(get(isUnsaved)).toBe(false);
    });

    it("handles save failures", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.pp");
      mockElectronAPI.saveFile.mockResolvedValue({
        success: false,
        error: "Permission denied",
      });

      await fileHandlers.saveProject();

      const notif = get(notification);
      expect(notif?.type).toBe("error");
    });

    it("relativizes macro paths when saving with writeFile", async () => {
      // Setup: Disable saveFile to force writeFile path
      const originalSaveFile = mockElectronAPI.saveFile;
      delete (mockElectronAPI as any).saveFile;

      // Mock makeRelativePath
      mockElectronAPI.makeRelativePath.mockImplementation((base, target) => {
        return "relative/" + target.split("/").pop();
      });

      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/project.pp");

      // Setup data with macro
      linesStore.set([]);
      sequenceStore.set([
        {
          kind: macroKind(),
          id: "m1",
          name: "Macro",
          filePath: "/absolute/path/to/macro.pp",
        } as any,
      ]);

      await fileHandlers.saveProject();

      expect(mockElectronAPI.showSaveDialog).toHaveBeenCalled();
      expect(mockElectronAPI.makeRelativePath).toHaveBeenCalledWith(
        "/saved/project.pp",
        "/absolute/path/to/macro.pp",
      );
      expect(mockElectronAPI.writeFile).toHaveBeenCalled();

      // Verify the content written has relative path
      const writtenContent = JSON.parse(
        mockElectronAPI.writeFile.mock.calls[0][1],
      );
      expect(writtenContent.sequence[0].filePath).toBe("relative/macro.pp");

      // Restore saveFile
      mockElectronAPI.saveFile = originalSaveFile;
    });

    it("includes header information in saved file", async () => {
      // Mock saveFile to return success
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: "/saved/file.pp",
      });
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.pp");
      // Ensure we have some data
      linesStore.set([{ id: "1", name: "Line 1" } as any]);

      await fileHandlers.saveProject();

      expect(mockElectronAPI.saveFile).toHaveBeenCalled();
      const callArgs = mockElectronAPI.saveFile.mock.calls[0]!;
      const content = JSON.parse(callArgs[0] as string);

      expect(content.version).toBe(pkg.version);
      expect(content.version).toBe(pkg.version);
      expect(content.header).toBeDefined();
      expect(content.header.info).toBe(
        "Created with Pedro Pathing Plus Visualizer",
      );
      expect(content.header.copyright).toContain("Copyright");
      expect(content.header.link).toBe(
        "https://github.com/Mallen220/PedroPathingPlusVisualizer",
      );
    });

    it("should NOT save settings in the .pp file", async () => {
      // Ensure we have some data
      linesStore.set([{ id: "1", name: "Line 1" } as any]);
      // Set a specific setting to verify
      settingsStore.update((s) => ({ ...s, fieldMap: "ShouldNotBeSaved" }));

      // Mock saveFile to return success
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: "/saved/file.pp",
      });
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.pp");

      await fileHandlers.saveProject();

      expect(mockElectronAPI.saveFile).toHaveBeenCalled();
      const callArgs = mockElectronAPI.saveFile.mock.calls[0]!;
      const savedData = JSON.parse(callArgs[0] as string);

      expect(savedData.settings).toBeUndefined();
    });
  });

  describe("handleExternalFileOpen", () => {
    it("loads file directly if no saved directory configured", async () => {
      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify({}));
      mockElectronAPI.getSavedDirectory.mockResolvedValue("");

      await fileHandlers.handleExternalFileOpen("/external/file.pp");

      expect(get(currentFilePath)).toBe("/external/file.pp");
    });

    it("prompts to copy if file is outside saved directory", async () => {
      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify({}));
      mockElectronAPI.getSavedDirectory.mockResolvedValue("/my/projects");
      mockElectronAPI.fileExists.mockResolvedValue(false); // Dest doesn't exist
      (global.confirm as any).mockReturnValue(true); // User says yes to copy

      await fileHandlers.handleExternalFileOpen("/external/file.pp");

      // Should check if it copies to /my/projects/file.pp
      // Depending on separator logic in implementation
      expect(mockElectronAPI.copyFile).toHaveBeenCalled();
      // We can't easily check exact string due to separator logic, but we verify copyFile was called
    });

    it("should just load if in saved directory", async () => {
      mockElectronAPI.readFile.mockResolvedValue("{}");
      mockElectronAPI.getSavedDirectory.mockResolvedValue("/project/dir");

      const { handleExternalFileOpen } = await import("../utils/fileHandlers");
      const confirmMock = vi.spyOn(window, "confirm");

      // Simulate file path being inside the project dir
      await handleExternalFileOpen("/project/dir/file.pp");

      expect(confirmMock).not.toHaveBeenCalled();
    });

    it("triggers auto-export (and embeds startPoint) when a file is opened externally and auto-export is enabled", async () => {
      const fileData = {
        startPoint: { x: 11, y: 22, heading: "constant", degrees: 123 },
        lines: [],
        sequence: [],
        shapes: [],
      };

      mockElectronAPI.readFile.mockResolvedValue(JSON.stringify(fileData));
      mockElectronAPI.getSavedDirectory.mockResolvedValue("/project/dir");
      // Ensure auto-export settings are enabled and set to JSON so content is predictable
      settingsStore.set({
        ...DEFAULT_SETTINGS,
        autoExportCode: true,
        autoExportFormat: "json",
        autoExportPath: "GeneratedCode",
      });

      // resolvePath will be called by handleAutoExport
      mockElectronAPI.resolvePath.mockResolvedValue(
        "/project/dir/GeneratedCode/file.json",
      );

      await fileHandlers.handleExternalFileOpen("/project/dir/file.pp");

      // writeFile must have been called for auto-export
      expect(mockElectronAPI.writeFile).toHaveBeenCalled();

      // Find the call where writeFile was invoked for the auto-export (first arg is path)
      const call = mockElectronAPI.writeFile.mock.calls.find(
        (c: any[]) => typeof c[1] === "string",
      );
      expect(call).toBeDefined();

      const exportedJson = JSON.parse(call![1] as string);
      expect(exportedJson.startPoint).toBeDefined();
      expect(exportedJson.startPoint.x).toBe(11);
      expect(exportedJson.startPoint.y).toBe(22);
      expect(exportedJson.startPoint.heading).toBe("constant");
      expect(exportedJson.startPoint.degrees).toBe(123);
    });
  });

  describe("exportAsPP", () => {
    it("includes header information in exported file", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/exported/file.pp");
      mockElectronAPI.writeFile.mockResolvedValue(true);

      await fileHandlers.exportAsPP();

      expect(mockElectronAPI.writeFile).toHaveBeenCalled();
      // writeFile called with (path, content)
      // find the call that matches the path
      const callArgs = mockElectronAPI.writeFile.mock.calls.find(
        (args) => args[0] === "/exported/file.pp",
      );
      expect(callArgs).toBeDefined();

      const content = JSON.parse(callArgs![1] as string);

      expect(content.header).toBeDefined();
      expect(content.header.info).toBe(
        "Created with Pedro Pathing Plus Visualizer",
      );
      expect(content.header.copyright).toContain("Copyright");
      expect(content.header.link).toBe(
        "https://github.com/Mallen220/PedroPathingPlusVisualizer",
      );
    });

    it("updates startPoint headings based on path geometry", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/exported/file.pp");
      mockElectronAPI.writeFile.mockResolvedValue(true);

      // Setup stores
      // Start Point at 0,0 with DEFAULT headings (90, 180)
      startPointStore.set({
        x: 0,
        y: 0,
        heading: "linear",
        startDeg: 90,
        endDeg: 180,
      });

      // Line from 0,0 to 10,10. Tangent is 45 degrees.
      // Line end point at 10,10. Tangent at end is also 45 degrees (straight line).
      linesStore.set([
        {
          id: "1",
          endPoint: {
            x: 10,
            y: 10,
            heading: "tangential",
            reverse: false,
          },
          controlPoints: [],
          name: "Line 1",
        } as any,
      ]);

      await fileHandlers.exportAsPP();

      expect(mockElectronAPI.writeFile).toHaveBeenCalled();
      const callArgs = mockElectronAPI.writeFile.mock.calls.find(
        (args) => args[0] === "/exported/file.pp",
      );
      const content = JSON.parse(callArgs![1] as string);

      expect(content.startPoint.startDeg).toBe(45);
      // End heading depends on logic. Since it's a straight line, end heading is 45.
      expect(content.startPoint.endDeg).toBe(45);
    });
  });
});
