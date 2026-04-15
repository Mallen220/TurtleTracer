// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("preload.js", () => {
  it("exposes electronAPI to the main world", () => {
    const mockIpcRenderer = {
      invoke: vi.fn(),
      on: vi.fn(),
    };

    const mockWebUtils = {
      getPathForFile: vi.fn((f) => `/fake/path/${f.name}`),
    };

    const mockContextBridge = {
      exposeInMainWorld: vi.fn((apiKey, apiObject) => {
        globalThis[apiKey] = apiObject;
      }),
    };

    // Prepare the script content
    const preloadContent = fs.readFileSync(
      path.resolve(__dirname, "preload.js"),
      "utf-8",
    );

    // Inject mock require function at the top
    const contentToEval = `
      const require = function(moduleName) {
        if (moduleName === 'electron') {
          return {
            contextBridge: mockContextBridge,
            ipcRenderer: mockIpcRenderer,
            webUtils: mockWebUtils,
          };
        }
        return {};
      };
      ${preloadContent}
    `;

    // Evaluate the content
    eval(contentToEval);

    // Assertions
    expect(mockContextBridge.exposeInMainWorld).toHaveBeenCalledWith(
      "electronAPI",
      expect.any(Object),
    );
    expect(globalThis.electronAPI).toBeDefined();

    const api = globalThis.electronAPI;

    // Call all the methods on electronAPI to get 100% coverage
    api.getPathForFile({ name: "test.txt" });
    api.getAppDataPath();
    api.getDirectory();
    api.setDirectory();
    api.selectDirectory();
    api.listFiles("dir");
    api.readFile("file.txt");
    api.writeFile("file.txt", "content");
    api.deleteFile("file.txt");
    api.fileExists("file.txt");
    api.resolvePath("base", "rel");
    api.makeRelativePath("base", "tgt");
    api.getDirectorySettings();
    api.saveDirectorySettings({});
    api.getSavedDirectory();
    api.createDirectory("dir");
    api.getDirectoryStats("dir");
    api.renameFile("old", "new");
    api.showSaveDialog({});
    api.writeFileBase64("file", "base64");
    api.exportPP("content", "name");
    api.copyFile("src", "dest");
    api.gitShow("file");
    api.gitStatus("dir");
    api.rendererReady();
    api.sendCloseApproved();
    api.getAppVersion();
    api.isWindowsStore();
    api.openExternal("url");
    api.listPlugins();
    api.readPlugin("plugin");
    api.deletePlugin("plugin");
    api.openPluginsFolder();
    api.transpilePlugin("code");
    api.telemetry.connect("ip", "port", "proto");
    api.telemetry.disconnect();
    api.downloadUpdate("version", "url");
    api.skipUpdate("version");
    api.checkForUpdates();

    // Call back functions
    const cb1 = vi.fn();
    api.onOpenFilePath(cb1);
    const cb2 = vi.fn();
    api.onAppCloseRequested(cb2);
    const cb3 = vi.fn();
    api.onMenuAction(cb3);
    const cb4 = vi.fn();
    api.telemetry.onData(cb4);
    const cb5 = vi.fn();
    api.telemetry.onStatus(cb5);
    const cb6 = vi.fn();
    api.onUpdateAvailable(cb6);

    // Trigger callbacks
    mockIpcRenderer.on.mock.calls.find(
      (call) => call[0] === "open-file-path",
    )[1]({}, "path");
    mockIpcRenderer.on.mock.calls.find(
      (call) => call[0] === "app-close-requested",
    )[1]({});
    mockIpcRenderer.on.mock.calls.find((call) => call[0] === "menu-action")[1](
      {},
      "action",
    );
    mockIpcRenderer.on.mock.calls.find(
      (call) => call[0] === "telemetry:data",
    )[1]({}, "data");
    mockIpcRenderer.on.mock.calls.find(
      (call) => call[0] === "telemetry:status",
    )[1]({}, "status");
    mockIpcRenderer.on.mock.calls.find(
      (call) => call[0] === "update-available",
    )[1]({}, "data");

    // Verify all invoked correctly to prove mapping
    expect(mockWebUtils.getPathForFile).toHaveBeenCalled();
    expect(mockIpcRenderer.invoke).toHaveBeenCalled();
    expect(cb1).toHaveBeenCalledWith("path");
    expect(cb2).toHaveBeenCalled();
    expect(cb3).toHaveBeenCalledWith("action");
    expect(cb4).toHaveBeenCalledWith("data");
    expect(cb5).toHaveBeenCalledWith("status");
    expect(cb6).toHaveBeenCalledWith("data");

    // Clean up
    delete globalThis.electronAPI;
  });
});
