// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  handlers: new Map(),
  openExternal: vi.fn(() => Promise.resolve()),
}));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => mocks.handlers.set(channel, fn) },
  BrowserWindow: { fromWebContents: () => null, getFocusedWindow: () => null },
  shell: { openExternal: mocks.openExternal },
  app: { getPath: () => "/fake", getVersion: () => "9.9.9" },
}));
vi.mock("../updater.js", () => ({ default: class {} }));

const { registerAppHandlers } = await import("./appHandlers.js");

const call = (channel, ...args) =>
  mocks.handlers.get(channel)({ sender: {} }, ...args);

let state;
beforeEach(() => {
  mocks.handlers.clear();
  mocks.openExternal.mockClear();
  state = {
    windows: new Set(),
    appUpdater: {
      handleDownloadAndInstall: vi.fn(),
      skipVersion: vi.fn(),
    },
  };
  registerAppHandlers(state);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("update:download", () => {
  it("passes on only the version, never an address from the page", async () => {
    await call("update:download", "2.8.0", "file:///etc/passwd");
    expect(state.appUpdater.handleDownloadAndInstall).toHaveBeenCalledWith(
      "2.8.0",
    );
  });

  it("does nothing before the updater exists", async () => {
    state.appUpdater = undefined;
    expect(call("update:download", "2.8.0")).toBeUndefined();
  });
});

describe("app:open-external", () => {
  it("opens web links", async () => {
    expect(await call("app:open-external", "https://example.com/a")).toBe(true);
    expect(mocks.openExternal).toHaveBeenCalledWith("https://example.com/a");
  });

  it.each([
    "file:///etc/passwd",
    "smb://host/share",
    "javascript:alert(1)",
    "nonsense",
  ])("refuses %s", async (url) => {
    expect(await call("app:open-external", url)).toBe(false);
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
});

describe("app info", () => {
  it("reports the version and data path", async () => {
    expect(await call("app:get-version")).toBe("9.9.9");
    expect(await call("app:get-app-data-path")).toBe("/fake");
  });
});
