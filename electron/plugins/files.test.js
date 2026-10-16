// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  fileInPlugin,
  isInside,
  isPluginId,
  isSafeRelativePath,
  pluginFolder,
} from "./files.js";
import { readManifest, validateManifest } from "./manifest.js";
import { listPlugins } from "./catalog.js";
import { createPluginState, STORAGE_LIMIT_BYTES } from "./state.js";

let root;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "tt-plugins-")),
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = async (file, contents) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
};

const manifest = (extra = {}) => ({
  id: "demo",
  name: "Demo",
  version: "1.0.0",
  apiVersion: 2,
  ...extra,
});

describe("paths inside a plugin", () => {
  it("accepts plain relative paths only", () => {
    expect(isSafeRelativePath("view/index.html")).toBe(true);
    for (const bad of [
      "",
      "/etc/passwd",
      "../x",
      "a/../../x",
      String.raw`a\b`,
      "a//b",
      "./a",
      "a\0b",
    ]) {
      expect(isSafeRelativePath(bad)).toBe(false);
    }
    expect(isPluginId("field-3d")).toBe(true);
    expect(isPluginId("Field 3D")).toBe(false);
    expect(isPluginId("../x")).toBe(false);
  });

  it("knows when one path is inside another", () => {
    expect(isInside("/a/b", "/a/b/c")).toBe(true);
    expect(isInside("/a/b", "/a/b")).toBe(true);
    expect(isInside("/a/b", "/a/bc")).toBe(false);
    expect(isInside("/a/b", "/a")).toBe(false);
  });

  it("finds files in the plugin and nothing outside it, even through links", async () => {
    await write(path.join(root, "demo/view/index.html"), "<p>hi</p>");
    await write(path.join(root, "secret.txt"), "secret");
    await fs.symlink(
      path.join(root, "secret.txt"),
      path.join(root, "demo/leak.txt"),
    );
    const folder = await pluginFolder(root, "demo");
    expect(await fileInPlugin(folder, "view/index.html")).toBe(
      path.join(folder, "view/index.html"),
    );
    expect(await fileInPlugin(folder, "leak.txt")).toBeNull();
    expect(await fileInPlugin(folder, "../secret.txt")).toBeNull();
    expect(await fileInPlugin(folder, "missing.js")).toBeNull();
    expect(await fileInPlugin(folder, "view")).toBeNull(); // a folder
    await expect(pluginFolder(root, "../demo")).rejects.toThrow();
  });
});

describe("manifests", () => {
  it("accepts a full manifest", () => {
    const result = validateManifest(
      manifest({
        main: "main.ts",
        views: {
          field3d: { entry: "view/index.html", slot: "field", title: "3D" },
        },
        themes: [{ name: "Pink", css: "pink.css" }],
        permissions: ["files.pick"],
        dependencies: { three: "0.170.0", "@scope/pkg": "^1.2.0" },
      }),
      "demo",
    );
    expect(result).toHaveProperty("manifest");
  });

  it("says what's wrong", () => {
    const cases = [
      [manifest({ id: "Demo" }), "id"],
      [manifest({ version: "one" }), "version"],
      [manifest({ main: "../main.ts" }), "main"],
      [manifest({ main: "main.py" }), "main"],
      [manifest({ permissions: ["network"] }), "permissions"],
      [manifest({ dependencies: { three: "latest-ish!!" } }), "dependencies"],
      [manifest({ unknown: true }), "unknown"],
    ];
    for (const [data, field] of cases) {
      const result = validateManifest(data, "demo");
      expect(result.error, field).toContain(
        field === "unknown" ? "plugin.json is invalid" : field,
      );
    }
    expect(validateManifest(manifest(), "other").error).toMatch(/must match/);
    expect(validateManifest(manifest({ apiVersion: 1 }), "demo").error).toMatch(
      /version 1/,
    );
  });

  it("reads plugin.json from a folder", async () => {
    await write(
      path.join(root, "demo/plugin.json"),
      JSON.stringify(manifest()),
    );
    expect(await readManifest(path.join(root, "demo"))).toHaveProperty(
      "manifest.name",
      "Demo",
    );
    await write(path.join(root, "broken/plugin.json"), "{ nope");
    expect((await readManifest(path.join(root, "broken"))).error).toMatch(
      /isn't valid JSON/,
    );
    expect((await readManifest(path.join(root, "nothing"))).error).toMatch(
      /no plugin.json/,
    );
  });
});

describe("the plugins folder", () => {
  it("lists plugins, broken ones with a reason, and old single files", async () => {
    await write(
      path.join(root, "demo/plugin.json"),
      JSON.stringify(manifest()),
    );
    await write(path.join(root, "bad/plugin.json"), "{}");
    await write(path.join(root, "Old.ts"), "turtle.registerTheme()");
    await write(path.join(root, "turtle.d.ts"), "declare const turtle: any;");
    await write(path.join(root, ".hidden/plugin.json"), "{}");
    const listings = await listPlugins(root);
    expect(listings.map((l) => l.id)).toEqual(["bad", "demo", "Old.ts"]);
    expect(listings[0].error).toMatch(/invalid/);
    expect(listings[1]).toMatchObject({
      manifest: { name: "Demo" },
      dependenciesInstalled: true,
    });
    expect(listings[2]).toMatchObject({ legacy: true });
  });
});

describe("plugin state", () => {
  it("remembers each plugin's record, and forgets it", async () => {
    const state = createPluginState(root);
    await state.update("demo", (r) => ({ ...r, enabled: true }));
    await state.update("demo", (r) => ({ ...r, grant: "g" }));
    expect(await state.readAll()).toEqual({
      demo: { enabled: true, grant: "g" },
    });
    await state.storageSet("demo", "k", { a: 1 });
    expect(await state.storageGet("demo", "k")).toEqual({ a: 1 });
    await state.forget("demo");
    expect(await state.readAll()).toEqual({});
    expect(await state.storageGet("demo", "k")).toBeUndefined();
  });

  it("limits storage and refuses bad ids", async () => {
    const state = createPluginState(root);
    await expect(
      state.storageSet("demo", "big", "x".repeat(STORAGE_LIMIT_BYTES)),
    ).rejects.toThrow(/limited/);
    expect(() => state.update("../x", (r) => r)).toThrow();
  });

  it("doesn't lose writes made at the same time", async () => {
    const state = createPluginState(root);
    await Promise.all(
      ["a", "b", "c", "d"].map((id) =>
        state.update(id, () => ({ enabled: true })),
      ),
    );
    expect(Object.keys(await state.readAll()).sort()).toEqual([
      "a",
      "b",
      "c",
      "d",
    ]);
  });
});
