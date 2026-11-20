// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const mocks = vi.hoisted(() => ({ handlers: new Map(), userData: "" }));

vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => mocks.handlers.set(channel, fn) },
  shell: { openPath: vi.fn(() => Promise.resolve("")) },
  app: { getPath: () => mocks.userData },
}));

const { registerPluginHandlers } = await import("./pluginHandlers.js");

const call = (channel, ...args) =>
  mocks.handlers.get(channel)({ sender: {} }, ...args);

let root;
let plugins;
beforeEach(async () => {
  mocks.handlers.clear();
  registerPluginHandlers();
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tt-pluginh-"));
  mocks.userData = path.join(root, "userData");
  plugins = path.join(mocks.userData, "plugins");
  await fs.mkdir(plugins, { recursive: true });
  await fs.writeFile(path.join(root, "outside.js"), "outside");
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});

describe("plugins:list", () => {
  it("lists scripts, not type files or other files", async () => {
    await fs.writeFile(path.join(plugins, "a.js"), "");
    await fs.writeFile(path.join(plugins, "b.ts"), "");
    await fs.writeFile(path.join(plugins, "turtle.d.ts"), "");
    await fs.writeFile(path.join(plugins, ".bundled-plugins.json"), "{}");
    await fs.writeFile(path.join(plugins, "notes.txt"), "");
    expect((await call("plugins:list")).sort()).toEqual(["a.js", "b.ts"]);
  });

  it("creates the folder when it is missing", async () => {
    await fs.rm(plugins, { recursive: true });
    expect(await call("plugins:list")).toEqual([]);
  });
});

describe("plugins:read and plugins:delete", () => {
  it("reads and deletes a plugin by name", async () => {
    await fs.writeFile(path.join(plugins, "a.js"), "code");
    expect(await call("plugins:read", "a.js")).toBe("code");
    expect(await call("plugins:delete", "a.js")).toBe(true);
    expect(await fs.readdir(plugins)).toEqual([]);
  });

  it.each([
    "../outside.js",
    String.raw`..\outside.js`,
    "sub/a.js",
    "/etc/passwd",
    "a.txt",
    "a b.js",
    ".js",
    "",
    "..",
    42,
    null,
  ])("refuses the name %j", async (name) => {
    await expect(call("plugins:read", name)).rejects.toThrow();
    await expect(call("plugins:delete", name)).rejects.toThrow();
    expect(await fs.readFile(path.join(root, "outside.js"), "utf-8")).toBe(
      "outside",
    );
  });

  it("says so when the plugin isn't there", async () => {
    await expect(call("plugins:read", "missing.js")).rejects.toThrow(
      "Plugin not found",
    );
  });

  it("won't follow a folder named like a plugin", async () => {
    await fs.mkdir(path.join(plugins, "dir.js"));
    await expect(call("plugins:read", "dir.js")).rejects.toThrow(
      "Plugin not found",
    );
  });
});

describe("plugins:transpile", () => {
  it("turns TypeScript into JavaScript", async () => {
    const js = await call("plugins:transpile", "const x: number = 1;");
    expect(js).toContain("const x = 1");
    expect(js).not.toContain(": number");
  });
});
