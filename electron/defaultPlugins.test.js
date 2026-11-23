// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

vi.mock("electron", () => ({ app: { getPath: vi.fn(() => "/fake") } }));

const { syncDefaultPlugins } = await import("./defaultPlugins.js");

let dir;
let source;
let dest;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-plugins-"));
  source = path.join(dir, "bundled");
  dest = path.join(dir, "user");
  await fs.mkdir(source);
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

const bundle = (name, text) => fs.writeFile(path.join(source, name), text);
const user = (name) => fs.readFile(path.join(dest, name), "utf-8");

describe("syncDefaultPlugins", () => {
  it("copies bundled plugins and type files into a new folder", async () => {
    await bundle("a.js", "v1");
    await bundle("turtle.d.ts", "types");
    await bundle("readme.md", "ignored");
    await syncDefaultPlugins(source, dest);
    expect(await user("a.js")).toBe("v1");
    expect(await user("turtle.d.ts")).toBe("types");
    expect(await fs.readdir(dest)).not.toContain("readme.md");
  });

  it("replaces a plugin the user never changed with the new version", async () => {
    await bundle("a.js", "v1");
    await syncDefaultPlugins(source, dest);
    await bundle("a.js", "v2 with a fix");
    await syncDefaultPlugins(source, dest);
    expect(await user("a.js")).toBe("v2 with a fix");
  });

  it("leaves a plugin the user edited alone", async () => {
    await bundle("a.js", "v1");
    await syncDefaultPlugins(source, dest);
    await fs.writeFile(path.join(dest, "a.js"), "my edit");
    await bundle("a.js", "v2");
    await syncDefaultPlugins(source, dest);
    expect(await user("a.js")).toBe("my edit");
  });

  it("leaves a copy from before versions were recorded alone", async () => {
    await fs.mkdir(dest);
    await fs.writeFile(path.join(dest, "a.js"), "old or edited");
    await bundle("a.js", "v2");
    await syncDefaultPlugins(source, dest);
    expect(await user("a.js")).toBe("old or edited");
  });

  it("starts updating a pre-record copy once it matches the bundled one", async () => {
    await fs.mkdir(dest);
    await fs.writeFile(path.join(dest, "a.js"), "v1");
    await bundle("a.js", "v1");
    await syncDefaultPlugins(source, dest);
    await bundle("a.js", "v2");
    await syncDefaultPlugins(source, dest);
    expect(await user("a.js")).toBe("v2");
  });

  it("brings back a bundled plugin the user deleted", async () => {
    await bundle("a.js", "v1");
    await syncDefaultPlugins(source, dest);
    await fs.rm(path.join(dest, "a.js"));
    await syncDefaultPlugins(source, dest);
    expect(await user("a.js")).toBe("v1");
  });

  it("keeps its record out of the plugin list", async () => {
    await bundle("a.js", "v1");
    await syncDefaultPlugins(source, dest);
    const listed = (await fs.readdir(dest)).filter(
      (f) => f.endsWith(".js") || f.endsWith(".ts"),
    );
    expect(listed).toEqual(["a.js"]);
  });
});
