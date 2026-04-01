// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import path from "path";

const handlerRegistry: Record<string, (...args: any[]) => Promise<any>> = {};

vi.mock("electron", () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => Promise<any>) => {
      handlerRegistry[channel] = handler;
    },
  },
  shell: {
    openPath: () => Promise.resolve(""),
  },
  app: {
    getPath: () => "/tmp/appdata",
  },
}));

vi.mock("fs/promises", () => {
  const fsPromisesMock = {
    mkdir: vi.fn(() => Promise.resolve()),
    readdir: vi.fn(() => Promise.resolve(["safe.js"])),
    readFile: vi.fn(() => Promise.resolve("file contents")),
    unlink: vi.fn(() => Promise.resolve()),
  };
  return {
    default: fsPromisesMock,
  };
});

vi.mock("../../electron/utils.js", () => ({
  getPluginsDirectory: vi.fn(() => "/tmp/appdata/plugins"),
}));

import { registerPluginHandlers } from "../../electron/ipc/pluginHandlers.js";

describe("Plugin IPC security handlers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(handlerRegistry).forEach((k) => delete handlerRegistry[k]);
    registerPluginHandlers();
  });

  it("plugins:read throws for path traversal filename", async () => {
    await expect(
      handlerRegistry["plugins:read"](null, "../../../etc/passwd"),
    ).rejects.toThrow("Invalid plugin filename");
  });

  it("plugins:delete throws for path traversal filename", async () => {
    await expect(
      handlerRegistry["plugins:delete"](null, "..\\..\\..\\etc\\passwd"),
    ).rejects.toThrow("Invalid plugin filename");
  });

  it("plugins:open-folder rejects if normalized path escapes plugins dir", async () => {
    const normalizeSpy = vi
      .spyOn(path, "normalize")
      .mockImplementation((value: string) => {
        if (value === "/tmp/appdata/plugins") return "/escaped/outside";
        return path.normalize(value);
      });

    await expect(handlerRegistry["plugins:open-folder"]()).rejects.toThrow(
      "Invalid path specified",
    );

    normalizeSpy.mockRestore();
  });

  it("plugins:read returns file contents for a safe filename and uses basename/join/normalize", async () => {
    const basenameSpy = vi.spyOn(path, "basename");
    const joinSpy = vi.spyOn(path, "join");
    const normalizeSpy = vi.spyOn(path, "normalize");

    const content = await handlerRegistry["plugins:read"](null, "safe.js");

    expect(content).toBe("file contents");
    expect(basenameSpy).toHaveBeenCalledWith("safe.js");
    expect(joinSpy).toHaveBeenCalledWith("/tmp/appdata/plugins", "safe.js");
    expect(normalizeSpy).toHaveBeenCalled();

    basenameSpy.mockRestore();
    joinSpy.mockRestore();
    normalizeSpy.mockRestore();
  });

  it("path.basename is applied before path.join in plugins:read path handling", async () => {
    const basenameSpy = vi.spyOn(path, "basename").mockReturnValue("safe.js");
    const joinSpy = vi.spyOn(path, "join");

    await handlerRegistry["plugins:read"](null, "safe.js");

    expect(basenameSpy).toHaveBeenCalledWith("safe.js");
    expect(joinSpy).toHaveBeenCalledWith("/tmp/appdata/plugins", "safe.js");

    basenameSpy.mockRestore();
    joinSpy.mockRestore();
  });
});
