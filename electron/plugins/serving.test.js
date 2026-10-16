// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// @vitest-environment node
// Bundling plugin scripts, serving them on turtle-plugin://, installing
// plugins and keeping the bundled ones up to date.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

vi.mock("electron", () => ({
  protocol: { registerSchemesAsPrivileged: vi.fn(), handle: vi.fn() },
}));

const { SANDBOX_SCRIPTS, bundle, clearBundleCache } =
  await import("./bundler.js");
const { servePluginFile, viewPolicy } = await import("./protocol.js");
const { installFromFolder, installFromZip } = await import("./install.js");
const { ensureDefaultPlugins } = await import("./defaults.js");

let root;
let pluginsDir;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "tt-serve-")),
  );
  pluginsDir = path.join(root, "plugins");
  await fs.mkdir(pluginsDir);
  clearBundleCache();
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

const write = async (file, contents) => {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, contents);
};

const manifest = (id, extra = {}) =>
  JSON.stringify({ id, name: id, version: "1.0.0", apiVersion: 2, ...extra });

describe("bundling", () => {
  it("bundles TypeScript and npm packages from the plugin folder", async () => {
    const folder = path.join(pluginsDir, "demo");
    await write(
      path.join(folder, "node_modules/lib/package.json"),
      '{"main":"index.js"}',
    );
    await write(
      path.join(folder, "node_modules/lib/index.js"),
      "module.exports = { twice: (n) => n * 2 };",
    );
    await write(
      path.join(folder, "main.ts"),
      'import { twice } from "lib";\nconst n: number = twice(21);\nturtle.ui.toast(String(n));',
    );
    const code = await bundle(folder, path.join(folder, "main.ts"), "main");
    expect(code).toMatch(/twice: \(\w+\) => \w+ \* 2/);
    expect(code).not.toContain(": number");
  });

  it("refuses files outside the plugin folder", async () => {
    const folder = path.join(pluginsDir, "demo");
    await write(path.join(root, "secret.txt"), "TOP SECRET");
    await write(
      path.join(folder, "main.ts"),
      'import s from "../../secret.txt";\nconsole.log(s);',
    );
    await expect(
      bundle(folder, path.join(folder, "main.ts"), "main"),
    ).rejects.toThrow(/outside the plugin's folder/);
  });

  it("only lets views import turtle:view", async () => {
    const folder = path.join(pluginsDir, "demo");
    const client = path.join(root, "client.js");
    await write(client, "export const connect = () => 'connected';");
    SANDBOX_SCRIPTS.viewClient = client;
    await write(
      path.join(folder, "view.js"),
      'import { connect } from "turtle:view";\nconsole.log(connect());',
    );
    expect(
      await bundle(folder, path.join(folder, "view.js"), "view"),
    ).toContain("connected");
    await expect(
      bundle(folder, path.join(folder, "view.js"), "main"),
    ).rejects.toThrow(/only be imported by a view/);
  });

  it("rebuilds when a file changes", async () => {
    const folder = path.join(pluginsDir, "demo");
    const file = path.join(folder, "main.js");
    await write(file, "console.log('one');");
    expect(await bundle(folder, file, "main")).toContain("one");
    await new Promise((r) => setTimeout(r, 20));
    await write(file, "console.log('two');");
    expect(await bundle(folder, file, "main")).toContain("two");
  });
});

describe("turtle-plugin://", () => {
  const enabled = async (id) => id === "demo";

  beforeEach(async () => {
    const folder = path.join(pluginsDir, "demo");
    await write(
      path.join(folder, "plugin.json"),
      manifest("demo", { main: "main.js" }),
    );
    await write(path.join(folder, "main.js"), "turtle.ui.toast('hi');");
    await write(path.join(folder, "view/index.html"), "<p>view</p>");
    await write(path.join(folder, "view/app.js"), "console.log('app');");
    await write(path.join(pluginsDir, "off/plugin.json"), manifest("off"));
    await write(path.join(pluginsDir, "off/index.html"), "<p>off</p>");
    const runtime = path.join(root, "runtime.js");
    await write(runtime, "/* runtime */");
    SANDBOX_SCRIPTS.runtime = runtime;
  });

  it("serves an enabled plugin's files with a strict policy", async () => {
    const res = await servePluginFile(
      "turtle-plugin://demo/view/index.html",
      pluginsDir,
      enabled,
    );
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p>view</p>");
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(res.headers.get("content-security-policy")).toBe(viewPolicy("demo"));
    expect(viewPolicy("demo")).toContain("default-src 'none'");
    // Nothing to fetch from: no network sources at all.
    expect(viewPolicy("demo")).toMatch(
      /connect-src turtle-plugin:\/\/demo data: blob:;/,
    );
    expect(
      viewPolicy("demo").replace(/frame-ancestors[^;]*/, ""),
    ).not.toContain("http");
  });

  it("bundles scripts and serves the runtime and main page", async () => {
    const app = await servePluginFile(
      "turtle-plugin://demo/view/app.js",
      pluginsDir,
      enabled,
    );
    expect(app.headers.get("content-type")).toContain("javascript");
    expect(await app.text()).toContain("app");
    const page = await servePluginFile(
      "turtle-plugin://demo/__turtle/main.html",
      pluginsDir,
      enabled,
    );
    expect(await page.text()).toContain("/__turtle/runtime.js");
    const runtime = await servePluginFile(
      "turtle-plugin://demo/__turtle/runtime.js",
      pluginsDir,
      enabled,
    );
    expect(await runtime.text()).toBe("/* runtime */");
    const main = await servePluginFile(
      "turtle-plugin://demo/__turtle/main.js",
      pluginsDir,
      enabled,
    );
    expect(await main.text()).toContain("toast");
  });

  it("serves nothing for plugins that are off, bad paths or missing files", async () => {
    for (const url of [
      "turtle-plugin://off/index.html",
      "turtle-plugin://demo/../off/index.html",
      "turtle-plugin://demo/%2e%2e/off/index.html",
      "turtle-plugin://demo/missing.html",
      "turtle-plugin://Demo/view/index.html",
      "turtle-plugin://demo/__turtle/other",
    ]) {
      const res = await servePluginFile(url, pluginsDir, enabled);
      expect(res.status, url).toBe(404);
    }
  });

  it("turns a build error into an error thrown in the view", async () => {
    await write(
      path.join(pluginsDir, "demo/view/broken.js"),
      "import x from './nope.js';",
    );
    const res = await servePluginFile(
      "turtle-plugin://demo/view/broken.js",
      pluginsDir,
      enabled,
    );
    expect(await res.text()).toMatch(/^throw new Error\(".*Couldn't build/);
  });
});

/** A zip with stored (uncompressed) entries. */
function zip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(entries)) {
    const data = Buffer.from(text);
    const nameBuf = Buffer.from(name);
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    locals.push(local, nameBuf, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const centralSize = centrals.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

describe("installing a plugin", () => {
  it("copies a folder in under the manifest's id", async () => {
    const source = path.join(root, "downloaded-main");
    await write(path.join(source, "plugin.json"), manifest("cool"));
    await write(path.join(source, "main.js"), "1");
    await fs.symlink("/etc/passwd", path.join(source, "link"));
    expect(
      await installFromFolder(pluginsDir, source, async () => true),
    ).toEqual({ id: "cool" });
    await expect(
      fs.access(path.join(pluginsDir, "cool/main.js")),
    ).resolves.toBeUndefined();
    await expect(
      fs.lstat(path.join(pluginsDir, "cool/link")),
    ).rejects.toThrow();
  });

  it("asks before replacing, and keeps the old one if told no", async () => {
    const source = path.join(root, "src");
    await write(path.join(source, "plugin.json"), manifest("cool"));
    await write(path.join(pluginsDir, "cool/old.txt"), "old");
    expect(
      await installFromFolder(pluginsDir, source, async () => false),
    ).toBeNull();
    await expect(
      fs.access(path.join(pluginsDir, "cool/old.txt")),
    ).resolves.toBeUndefined();
  });

  it("refuses a folder without a valid manifest", async () => {
    const source = path.join(root, "src");
    await write(path.join(source, "plugin.json"), JSON.stringify({ id: "x" }));
    await expect(
      installFromFolder(pluginsDir, source, async () => true),
    ).rejects.toThrow(/invalid/);
    await expect(
      installFromFolder(pluginsDir, root, async () => true),
    ).rejects.toThrow(/no plugin.json/);
  });

  it("installs from a zip, with the plugin at the top or in one folder", async () => {
    const file = path.join(root, "p.zip");
    await fs.writeFile(
      file,
      zip({
        "cool-main/plugin.json": manifest("cool"),
        "cool-main/main.js": "1",
      }),
    );
    expect(await installFromZip(pluginsDir, file, async () => true)).toEqual({
      id: "cool",
    });
    const entries = await fs.readdir(pluginsDir);
    expect(entries).toEqual(["cool"]);
  });

  it("refuses a zip that tries to write outside", async () => {
    const file = path.join(root, "evil.zip");
    await fs.writeFile(
      file,
      zip({ "plugin.json": manifest("evil"), "../../escaped.txt": "x" }),
    );
    await expect(
      installFromZip(pluginsDir, file, async () => true),
    ).rejects.toThrow();
    await expect(fs.access(path.join(root, "escaped.txt"))).rejects.toThrow();
    expect(await fs.readdir(pluginsDir)).toEqual([]);
  });
});

describe("bundled plugins", () => {
  it("are copied in, updated while unchanged, and left alone once edited", async () => {
    const bundled = path.join(root, "bundled");
    await write(path.join(bundled, "demo/plugin.json"), manifest("demo"));
    await write(path.join(bundled, "demo/view/index.html"), "<canvas>");
    await write(path.join(bundled, "turtle.d.ts"), "// v1");
    await ensureDefaultPlugins(pluginsDir, bundled);
    expect(
      await fs.readFile(path.join(pluginsDir, "turtle.d.ts"), "utf8"),
    ).toBe("// v1");
    expect(
      await fs.readFile(path.join(pluginsDir, "demo/view/index.html"), "utf8"),
    ).toBe("<canvas>");

    // A new version replaces an unchanged copy.
    await write(
      path.join(bundled, "demo/plugin.json"),
      manifest("demo", { version: "1.1.0" }),
    );
    await ensureDefaultPlugins(pluginsDir, bundled);
    expect(
      JSON.parse(
        await fs.readFile(path.join(pluginsDir, "demo/plugin.json"), "utf8"),
      ).version,
    ).toBe("1.1.0");

    // An edited copy is the user's now.
    await write(path.join(pluginsDir, "demo/mine.txt"), "edited");
    await write(
      path.join(bundled, "demo/plugin.json"),
      manifest("demo", { version: "1.2.0" }),
    );
    await ensureDefaultPlugins(pluginsDir, bundled);
    expect(
      JSON.parse(
        await fs.readFile(path.join(pluginsDir, "demo/plugin.json"), "utf8"),
      ).version,
    ).toBe("1.1.0");
  });

  it("removes unmodified copies of the old single-file plugins only", async () => {
    const legacy = JSON.parse(
      await fs.readFile(
        new URL("./legacy-bundled.json", import.meta.url),
        "utf8",
      ),
    );
    expect(Object.keys(legacy)).toContain("StickyNotes.ts");
    await write(path.join(pluginsDir, "Mine.ts"), "my own plugin");
    // No bundled folder: it says so, and carries on.
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await ensureDefaultPlugins(pluginsDir, path.join(root, "none"));
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
    await expect(
      fs.access(path.join(pluginsDir, "Mine.ts")),
    ).resolves.toBeUndefined();
  });
});
