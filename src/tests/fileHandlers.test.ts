// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import * as fileHandlers from "../utils/fileHandlers";
import { currentFilePath, isUnsaved, notification } from "../stores";
import {
  startPointStore,
  linesStore,
  sequenceStore,
  shapesStore,
  settingsStore,
} from "../lib/projectStore";
// recordChange lives in App.svelte and will trigger auto-export when called

import { DEFAULT_SETTINGS } from "../config/defaults";
import { actionRegistry } from "../lib/actionRegistry";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { SequenceMacroItem, TurtleData } from "../types";
import { exporterRegistry } from "../lib/exporters";
import pkg from "../../package.json";
import { pathInMessage } from "../utils/messagePaths";

const macroKind = (): SequenceMacroItem["kind"] =>
  (actionRegistry.getAll().find((a: any) => a.isMacro)
    ?.kind as SequenceMacroItem["kind"]) ?? "macro";

// Mock Svelte stores
vi.mock("../stores", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../stores")>();
  const { writable } = await import("svelte/store");
  return {
    ...actual,
    currentFilePath: writable(""),
    isUnsaved: writable(false),
    notification: writable(null),
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
    (globalThis as any).electronAPI = mockElectronAPI;

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
      delete (globalThis as any).electronAPI;
      const { loadRecentFile } = await import("../utils/fileHandlers");
      const alertMock = vi
        .spyOn(globalThis, "alert")
        .mockImplementation(() => {});

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
    const setupSaveTest = async (dialogPath: string, expectedPath: string) => {
      mockElectronAPI.showSaveDialog.mockResolvedValue(dialogPath);
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: expectedPath,
      });

      linesStore.set([{ id: "1", name: "Line 1" } as any]);

      await fileHandlers.saveProject();
    };

    it("uses saveFile API when available", async () => {
      await setupSaveTest("/saved/file.turt", "/saved/file.turt");

      expect(mockElectronAPI.saveFile).toHaveBeenCalled();
      expect(get(currentFilePath)).toBe("/saved/file.turt");
      expect(get(isUnsaved)).toBe(false);
    });

    it("converts legacy .pp paths to .turt on save", async () => {
      await setupSaveTest("/saved/file.pp", "/saved/file.turt");

      const callArgs = mockElectronAPI.saveFile.mock.calls[0];
      expect(callArgs[1]).toBe("/saved/file.turt");
      expect(get(currentFilePath)).toBe("/saved/file.turt");
    });

    it("handles save failures", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.turt");
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

      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/project.turt");

      // Setup data with macro
      linesStore.set([]);
      sequenceStore.set([
        {
          kind: macroKind(),
          id: "m1",
          name: "Macro",
          filePath: "/absolute/path/to/macro.turt",
        } as any,
      ]);

      await fileHandlers.saveProject();

      expect(mockElectronAPI.showSaveDialog).toHaveBeenCalled();
      expect(mockElectronAPI.makeRelativePath).toHaveBeenCalledWith(
        "/saved/project.turt",
        "/absolute/path/to/macro.turt",
      );
      expect(mockElectronAPI.writeFile).toHaveBeenCalled();

      // Verify the content written has relative path
      const writtenContent = JSON.parse(
        mockElectronAPI.writeFile.mock.calls[0][1],
      );
      expect(writtenContent.sequence[0].filePath).toBe("relative/macro.turt");

      // Restore saveFile
      mockElectronAPI.saveFile = originalSaveFile;
    });

    it("includes header information in saved file", async () => {
      // Mock saveFile to return success
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: "/saved/file.turt",
      });
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.turt");

      linesStore.set([{ id: "1", name: "Line 1" } as any]);

      await fileHandlers.saveProject();

      expect(mockElectronAPI.saveFile).toHaveBeenCalled();
      const callArgs = mockElectronAPI.saveFile.mock.calls[0]!;
      const content = JSON.parse(callArgs[0] as string);

      expect(content.version).toBe(pkg.version);
      expect(content.version).toBe(pkg.version);
      expect(content.header).toBeDefined();
      expect(content.header.info).toBe("Created with Turtle Tracer");
      expect(content.header.copyright).toContain("Copyright");
      expect(content.header.link).toBe(
        "https://github.com/Mallen220/TurtleTracer",
      );
    });

    it("should NOT save settings in the project file", async () => {
      linesStore.set([{ id: "1", name: "Line 1" } as any]);
      // Set a specific setting to verify
      settingsStore.update((s) => ({ ...s, fieldMap: "ShouldNotBeSaved" }));

      // Mock saveFile to return success
      mockElectronAPI.saveFile.mockResolvedValue({
        success: true,
        filepath: "/saved/file.turt",
      });
      mockElectronAPI.showSaveDialog.mockResolvedValue("/saved/file.turt");

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
      (globalThis.confirm as any).mockReturnValue(true); // User says yes to copy

      await fileHandlers.handleExternalFileOpen("/external/file.pp");

      // Should check if it copies to /my/projects/file.pp
      // Depending on separator logic in implementation
      expect(mockElectronAPI.copyFile).toHaveBeenCalled();
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

    // New regression test for auto-export on every change (including event markers)
    it("auto-exports when recordChange is invoked with project modifications", async () => {
      const fileHandlersImport = await import("../utils/fileHandlers");
      const { handleAutoExport } = fileHandlersImport;

      // configure settings and path
      settingsStore.set({
        ...DEFAULT_SETTINGS,
        autoExportCode: true,
        autoExportFormat: "json",
        autoExportPath: "GeneratedCode",
      });
      currentFilePath.set("/project/dir/auto.turt");

      // prepare mocks
      mockElectronAPI.resolvePath.mockResolvedValue(
        "/project/dir/GeneratedCode/auto.json",
      );
      mockElectronAPI.writeFile.mockResolvedValue(true);

      // initialize some project state with an event marker
      startPointStore.set({ x: 0, y: 0, heading: "constant", degrees: 0 });
      linesStore.set([
        {
          id: "line1",
          endPoint: { x: 1, y: 1 },
          controlPoints: [],
          color: "#000000",
          eventMarkers: [{ name: "marker1", percent: 0.5 }],
        } as any,
      ]);
      sequenceStore.set([]);
      shapesStore.set([]);
      const currentSettings = get(settingsStore);
      const currentStartPoint = get(startPointStore);
      const currentLines = get(linesStore);
      const currentSequence = get(sequenceStore);
      const currentShapes = get(shapesStore);

      await handleAutoExport(
        currentStartPoint,
        currentLines,
        currentSequence,
        currentSettings,
        currentShapes,
        {} as TurtleData,
        "/project/dir/auto.turt",
      );

      // verify auto-export occurred
      expect(mockElectronAPI.writeFile).toHaveBeenCalled();
    });

    it("autoExportAfterChange exports the current project as JSON", async () => {
      settingsStore.set({
        ...DEFAULT_SETTINGS,
        autoExportCode: true,
        autoExportFormat: "json",
        autoExportPath: "GeneratedCode",
      });
      mockElectronAPI.resolvePath.mockResolvedValue(
        "/project/dir/GeneratedCode/auto.json",
      );
      mockElectronAPI.writeFile.mockResolvedValue(true);
      startPointStore.set({ x: 3, y: 4, heading: "constant", degrees: 90 });
      linesStore.set([
        {
          id: "line1",
          endPoint: { x: 10, y: 20 },
          controlPoints: [],
          color: "#000000",
        } as any,
      ]);
      sequenceStore.set([{ kind: "path", lineId: "line1" }]);
      shapesStore.set([]);

      await fileHandlers.autoExportAfterChange("/project/dir/auto.turt");

      const [path, content] = mockElectronAPI.writeFile.mock.calls[0];
      expect(path).toBe("/project/dir/GeneratedCode/auto.json");
      const exported = JSON.parse(content as string);
      expect(exported.version).toBe(pkg.version);
      expect(exported.header.info).toBe("Created with Turtle Tracer");
      expect(exported.startPoint).toMatchObject({ x: 3, y: 4, degrees: 90 });
      expect(exported.lines).toHaveLength(1);
      expect(exported.sequence).toEqual([{ kind: "path", lineId: "line1" }]);
    });

    it("autoExportAfterChange does nothing when auto-export is off", async () => {
      settingsStore.set({ ...DEFAULT_SETTINGS, autoExportCode: false });

      await fileHandlers.autoExportAfterChange("/project/dir/auto.turt");

      expect(mockElectronAPI.writeFile).not.toHaveBeenCalled();
    });

    it("alerts when JSON parsing fails (corrupt file)", async () => {
      mockElectronAPI.readFile.mockResolvedValue("invalid-json");
      mockElectronAPI.getSavedDirectory.mockResolvedValue("/project/dir");

      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      await fileHandlers.handleExternalFileOpen("/external/file.pp");

      expect(globalThis.alert).toHaveBeenCalledWith(
        expect.stringContaining("Failed to load file: Unexpected token"),
      );

      consoleSpy.mockRestore();
    });
  });

  describe("exportAsProjectFile", () => {
    it("includes header information in exported file", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/exported/file.turt");
      mockElectronAPI.writeFile.mockResolvedValue(true);

      await fileHandlers.exportAsProjectFile();

      expect(mockElectronAPI.writeFile).toHaveBeenCalled();
      // writeFile called with (path, content)
      // find the call that matches the path
      const callArgs = mockElectronAPI.writeFile.mock.calls.find(
        (args) => args[0] === "/exported/file.turt",
      );
      expect(callArgs).toBeDefined();

      const content = JSON.parse(callArgs![1] as string);

      expect(content.header).toBeDefined();
      expect(content.header.info).toBe("Created with Turtle Tracer");
      expect(content.header.copyright).toContain("Copyright");
      expect(content.header.link).toBe(
        "https://github.com/Mallen220/TurtleTracer",
      );
    });

    it("updates startPoint headings based on path geometry", async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/exported/file.turt");
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

      await fileHandlers.exportAsProjectFile();

      expect(mockElectronAPI.writeFile).toHaveBeenCalled();
      const callArgs = mockElectronAPI.writeFile.mock.calls.find(
        (args) => args[0] === "/exported/file.turt",
      );
      const content = JSON.parse(callArgs![1] as string);

      expect(content.startPoint.startDeg).toBe(45);
      // End heading depends on logic. Since it's a straight line, end heading is 45.
      expect(content.startPoint.endDeg).toBe(45);
    });
  });

  describe("what the project file stores about poses", () => {
    const save = async () => {
      mockElectronAPI.showSaveDialog.mockResolvedValue("/exported/file.turt");
      mockElectronAPI.writeFile.mockResolvedValue(true);
      await fileHandlers.exportAsProjectFile();
      const call = mockElectronAPI.writeFile.mock.calls.find(
        (args) => args[0] === "/exported/file.turt",
      );
      return JSON.parse(call![1] as string);
    };
    const line = (id: string, x: number, end: object) =>
      ({
        id,
        name: id,
        endPoint: { x, y: 30, ...end },
        controlPoints: [],
      }) as any;

    it("keeps each point once, in the start point and lines, with no copy of them", async () => {
      startPointStore.set({ x: 10, y: 20, heading: "constant", degrees: 90 });
      linesStore.set([line("A", 40, { heading: "constant", degrees: 135 })]);
      expect(await save()).not.toHaveProperty("poses");
    });

    // Generated code starts the robot at the heading of the first path it
    // drives, and the library reads that back from startDeg.
    it("saves the start heading of the first path in the sequence, not the first line", async () => {
      startPointStore.set({ x: 10, y: 10, heading: "constant", degrees: 0 });
      linesStore.set([
        line("A", 30, { heading: "constant", degrees: 135 }),
        line("B", 50, { heading: "constant", degrees: 45 }),
      ]);
      sequenceStore.set([
        { kind: "path", lineId: "B" },
        { kind: "path", lineId: "A" },
      ] as any);
      const { startPoint } = await save();
      expect(startPoint).toMatchObject({ heading: "linear", startDeg: 45 });
    });

    it("saves the first line's start heading when the sequence is in order", async () => {
      startPointStore.set({ x: 10, y: 10, heading: "constant", degrees: 0 });
      linesStore.set([
        line("A", 30, { heading: "constant", degrees: 135 }),
        line("B", 50, { heading: "constant", degrees: 45 }),
      ]);
      sequenceStore.set([
        { kind: "path", lineId: "A" },
        { kind: "path", lineId: "B" },
      ] as any);
      const { startPoint } = await save();
      expect(startPoint.startDeg).toBe(135);
    });
  });

  describe("loadFile", () => {
    function setupMockFileReaderAndEvent(fileName = "newfile.turt") {
      const evt = {
        target: {
          files: [{ name: fileName }],
          value: "somepath",
        },
      } as unknown as Event;

      let onloadHandler: any;
      const mockFileReader = {
        readAsText: vi.fn(function (this: any) {
          onloadHandler = this.onload;
        }),
      };
      vi.stubGlobal(
        "FileReader",
        vi.fn(() => mockFileReader),
      );

      return { evt, mockFileReader, getOnloadHandler: () => onloadHandler };
    }

    it("returns early if no file is selected", async () => {
      const evt = { target: { files: [] } } as unknown as Event;
      await fileHandlers.loadFile(evt);
      expect(get(currentFilePath)).toBe("");
    });

    it("alerts and clears input if an unsupported file extension is used", async () => {
      const evt = {
        target: { files: [{ name: "wrong.txt" }], value: "somepath" },
      } as unknown as Event;
      await fileHandlers.loadFile(evt);
      expect(globalThis.alert).toHaveBeenCalledWith(
        "Please select a .turt or .pp file",
      );
      expect((evt.target as any).value).toBe("");
    });

    it("uses electronAPI copy logic if available and currentFilePath is set", async () => {
      currentFilePath.set("/project/dir/current.turt");
      const { evt, mockFileReader, getOnloadHandler } =
        setupMockFileReaderAndEvent("newfile.turt");
      const fileData = { lines: [], sequence: [] };
      const fileContent = JSON.stringify(fileData);

      mockElectronAPI.fileExists.mockResolvedValue(false);
      mockElectronAPI.writeFile.mockResolvedValue(true);

      await fileHandlers.loadFile(evt);

      expect(mockFileReader.readAsText).toHaveBeenCalled();

      // Now execute the onload handler and wait for it
      await getOnloadHandler()({ target: { result: fileContent } });

      expect(mockElectronAPI.writeFile).toHaveBeenCalledWith(
        "/project/dir/newfile.turt",
        fileContent,
      );
      expect(get(currentFilePath)).toBe("/project/dir/newfile.turt");
    });

    it("prompts for overwrite if file exists during electronAPI copy", async () => {
      currentFilePath.set("/project/dir/current.turt");
      const { evt, getOnloadHandler } =
        setupMockFileReaderAndEvent("existing.turt");
      const fileContent = JSON.stringify({ lines: [], sequence: [] });

      mockElectronAPI.fileExists.mockResolvedValue(true); // File exists!
      const confirmMock = vi.fn().mockReturnValue(false); // User declines overwrite
      vi.stubGlobal("confirm", confirmMock);

      await fileHandlers.loadFile(evt);
      await getOnloadHandler()({ target: { result: fileContent } });

      expect(confirmMock).toHaveBeenCalled();
      // Write file should not be called because user declined
      expect(mockElectronAPI.writeFile).not.toHaveBeenCalled();
    });

    it("alerts when JSON parsing fails (corrupt file)", async () => {
      currentFilePath.set("/project/dir/current.turt");
      const { evt, getOnloadHandler } =
        setupMockFileReaderAndEvent("corrupt.turt");

      await fileHandlers.loadFile(evt);

      await getOnloadHandler()({ target: { result: "invalid-json" } });

      expect(globalThis.alert).toHaveBeenCalledWith(
        expect.stringContaining("Error parsing file: Unexpected token"),
      );
    });

    it("falls back to loadTrajectoryFromFile when electronAPI is absent or currentFilePath is empty", async () => {
      currentFilePath.set(""); // This will trigger fallback

      // Since it uses the web fallback, we need to mock loadTrajectoryFromFile
      // But wait, loadTrajectoryFromFile is exported from "./index.ts" and imported into fileHandlers
      // Let's just mock the FileReader that loadTrajectoryFromFile creates!

      const { evt, getOnloadHandler } = setupMockFileReaderAndEvent("web.turt");

      await fileHandlers.loadFile(evt);

      const fileData = { lines: [], sequence: [] };
      getOnloadHandler()({ target: { result: JSON.stringify(fileData) } }); // sync call

      // wait a tick for the async success callback
      await new Promise((r) => setTimeout(r, 0));

      expect(get(isUnsaved)).toBe(false);
    });
  });
});

// --- Path helpers, saving options and auto export ---

describe("path helpers", () => {
  it("fileNameOf takes the last part of a path with either separator", () => {
    expect(fileHandlers.fileNameOf("/a/b/c.turt")).toBe("c.turt");
    expect(fileHandlers.fileNameOf(String.raw`C:\a\b\c.turt`)).toBe("c.turt");
    expect(fileHandlers.fileNameOf("plain.turt")).toBe("plain.turt");
    expect(fileHandlers.fileNameOf("/a/b/")).toBe("");
  });

  it("directoryOf drops the file name, whichever separator is used", () => {
    expect(fileHandlers.directoryOf("/a/b/c.turt")).toBe("/a/b");
    expect(fileHandlers.directoryOf(String.raw`C:\a\b\c.turt`)).toBe(
      String.raw`C:\a\b`,
    );
    expect(fileHandlers.directoryOf(String.raw`C:\a/b\c.turt`)).toBe(
      String.raw`C:\a/b`,
    );
  });

  it("joinPath uses the directory's own separator without doubling it", () => {
    expect(fileHandlers.joinPath("/a/b", "c.turt")).toBe("/a/b/c.turt");
    expect(fileHandlers.joinPath("/a/b/", "c.turt")).toBe("/a/b/c.turt");
    expect(fileHandlers.joinPath(String.raw`C:\a\b`, "c.turt")).toBe(
      String.raw`C:\a\b\c.turt`,
    );
    expect(fileHandlers.joinPath("C:\\a\\b\\", "c.turt")).toBe(
      String.raw`C:\a\b\c.turt`,
    );
  });
});

describe("saving and closing", () => {
  const api = {
    writeFile: vi.fn(),
    readFile: vi.fn(),
    fileExists: vi.fn(),
    saveFile: vi.fn(),
    showSaveDialog: vi.fn(),
    resolvePath: vi.fn(),
    createDirectory: vi.fn(),
    makeRelativePath: vi.fn(),
  };

  beforeEach(() => {
    actionRegistry.reset();
    registerCoreUI();
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    (globalThis as any).electronAPI = api;
    api.saveFile.mockImplementation(async (_content: string, path: string) => ({
      success: true,
      filepath: path,
    }));
    currentFilePath.set("");
    isUnsaved.set(false);
    notification.set(null);
    settingsStore.set({ ...DEFAULT_SETTINGS, recentFiles: [] });
    startPointStore.set({ x: 0, y: 0, heading: "tangential" } as any);
    linesStore.set([]);
    sequenceStore.set([]);
    shapesStore.set([]);
  });

  describe("autosaveBeforeLeaving", () => {
    const arrange = (over: {
      mode?: string;
      unsaved?: boolean;
      path?: string;
    }) => {
      settingsStore.set({
        ...DEFAULT_SETTINGS,
        autosaveMode: (over.mode ?? "close") as any,
      });
      isUnsaved.set(over.unsaved ?? true);
      currentFilePath.set(over.path ?? "/p/a.turt");
    };

    it("saves the open file, silently, when it has unsaved changes", async () => {
      arrange({});
      await fileHandlers.autosaveBeforeLeaving();
      expect(api.saveFile).toHaveBeenCalledTimes(1);
      expect(api.saveFile.mock.calls[0][1]).toBe("/p/a.turt");
      expect(get(isUnsaved)).toBe(false);
      expect(get(notification)).toBeNull();
    });

    it("does nothing unless autosave-on-close is on, there are changes and a file is open", async () => {
      arrange({ mode: "off" });
      await fileHandlers.autosaveBeforeLeaving();
      arrange({ unsaved: false });
      await fileHandlers.autosaveBeforeLeaving();
      arrange({ path: "" });
      await fileHandlers.autosaveBeforeLeaving();
      expect(api.saveFile).not.toHaveBeenCalled();
      expect(api.showSaveDialog).not.toHaveBeenCalled();
    });
  });

  describe("saveProject options", () => {
    it("asks where to save when there is no file yet, and stops if cancelled", async () => {
      api.showSaveDialog.mockResolvedValue(undefined);
      expect(await fileHandlers.saveProject()).toBe(false);
      expect(api.saveFile).not.toHaveBeenCalled();
      expect(get(currentFilePath)).toBe("");
    });

    it("saveAs asks for a new location even though a file is open", async () => {
      currentFilePath.set("/p/old.turt");
      api.showSaveDialog.mockResolvedValue("/p/new.turt");
      expect(await fileHandlers.saveProject({ saveAs: true })).toBe(true);
      expect(api.showSaveDialog).toHaveBeenCalled();
      expect(get(currentFilePath)).toBe("/p/new.turt");
    });

    it("saves to an explicit path, adds the .turt extension, and remembers the file", async () => {
      await fileHandlers.saveProject({ path: "/p/noext" });
      expect(api.saveFile.mock.calls[0][1]).toBe("/p/noext.turt");
      expect(get(settingsStore).recentFiles).toEqual(["/p/noext.turt"]);
    });

    it("lists the most recently saved file first, without duplicates, at most ten", async () => {
      const older = Array.from({ length: 12 }, (_, i) => `/p/f${i}.turt`);
      settingsStore.set({ ...DEFAULT_SETTINGS, recentFiles: older });
      await fileHandlers.saveProject({ path: "/p/f5.turt" });
      const recent = get(settingsStore).recentFiles!;
      expect(recent[0]).toBe("/p/f5.turt");
      expect(recent.filter((f) => f === "/p/f5.turt")).toHaveLength(1);
      expect(recent).toHaveLength(10);
    });

    it("tells the user about a success unless asked to stay quiet", async () => {
      await fileHandlers.saveProject({ path: "/p/a.turt" });
      expect(get(notification)).toMatchObject({
        type: "success",
        message: `Project saved to ${pathInMessage("/p/a.turt")}`,
      });
      notification.set(null);
      await fileHandlers.saveProject({ path: "/p/a.turt", quiet: true });
      expect(get(notification)).toBeNull();
    });

    it("warns when an old .pp project was converted", async () => {
      await fileHandlers.saveProject({ path: "/p/old.pp" });
      expect(get(notification)).toMatchObject({ type: "warning" });
      expect(get(notification)!.message).toContain("Legacy .pp");
    });

    it("reports an error if writing throws", async () => {
      api.saveFile.mockRejectedValue(new Error("disk full"));
      expect(await fileHandlers.saveProject({ path: "/p/a.turt" })).toBe(false);
      expect(get(notification)).toMatchObject({
        type: "error",
        message: "Save failed: disk full",
      });
    });
  });

  describe("handleAutoExport", () => {
    const run = (
      settings: Record<string, unknown>,
      target = "/p/dir/Auto.turt",
    ) =>
      fileHandlers.handleAutoExport(
        { x: 0, y: 0, heading: "tangential" } as any,
        [],
        [],
        { ...DEFAULT_SETTINGS, ...settings } as any,
        [],
        { shapes: [] } as any,
        target,
      );

    beforeEach(() => {
      api.resolvePath.mockImplementation(
        async (_from: string, rel: string) => `/p/dir/${rel}`,
      );
      exporterRegistry.reset();
    });

    it("does nothing when auto export is off, or the desktop API can't resolve paths", async () => {
      await run({ autoExportCode: false });
      (globalThis as any).electronAPI = { ...api, resolvePath: undefined };
      await run({ autoExportCode: true, autoExportFormat: "json" });
      expect(api.writeFile).not.toHaveBeenCalled();
    });

    it("writes the code from the chosen exporter into the export folder", async () => {
      const exportCode = vi.fn(async () => "// generated");
      exporterRegistry.register({ id: "java", name: "Java", exportCode });
      await run({
        autoExportCode: true,
        autoExportFormat: "java",
        autoExportPath: "Out",
        autoExportFullClass: false,
        javaPackageName: "org.team",
      });
      expect(api.createDirectory).toHaveBeenCalledWith("/p/dir/Out");
      expect(api.writeFile).toHaveBeenCalledWith(
        "/p/dir/Out/Auto.java",
        "// generated",
      );
      const options = (exportCode.mock.calls[0] as any)[1];
      expect(options).toMatchObject({
        fileName: "Auto",
        exportFullCode: false,
        packageName: "org.team",
        targetLibrary: "SolversLib",
      });
      expect(get(notification)).toMatchObject({
        type: "success",
        message: "Code auto-exported to Auto.java",
      });
    });

    it("uses a .txt extension for point lists and GeneratedCode as the default folder", async () => {
      exporterRegistry.register({
        id: "points",
        name: "Points",
        exportCode: () => "1,2",
      });
      await run({
        autoExportCode: true,
        autoExportFormat: "points",
        autoExportPath: "",
      });
      expect(api.writeFile).toHaveBeenCalledWith(
        "/p/dir/GeneratedCode/Auto.txt",
        "1,2",
      );
    });

    it("warns, rather than failing the save, when the format doesn't exist", async () => {
      await run({ autoExportCode: true, autoExportFormat: "nonsense" });
      expect(api.writeFile).not.toHaveBeenCalled();
      expect(get(notification)).toMatchObject({ type: "warning" });
      expect(get(notification)!.message).toContain("nonsense");
    });

    it("warns when the file can't be written", async () => {
      api.writeFile.mockRejectedValue(new Error("read-only"));
      await run({ autoExportCode: true, autoExportFormat: "json" });
      expect(get(notification)).toMatchObject({
        type: "warning",
        message: "Auto Export Failed: read-only",
      });
    });
  });
});
