// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Turns a plugin's TypeScript or JavaScript, and the npm packages it
// imports, into one file the sandbox can run. Uses esbuild's WebAssembly
// build, so it works the same on every platform. Nothing outside the
// plugin's folder can be bundled in.
import childProcess from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isInside } from "./files.js";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * The scripts that run in plugin sandboxes, built from
 * src/lib/plugins/{runtime,view} by `vite build`.
 */
export const SANDBOX_SCRIPTS = {
  runtime: path.join(here, "../../dist/plugin-runtime.js"),
  viewClient: path.join(here, "../../dist/plugin-view-client.js"),
};

let esbuildPromise;

/**
 * esbuild-wasm runs its WebAssembly in a child process started as `node`,
 * found on the PATH. Most people don't have Node.js installed, and one that
 * is can't read the app's asar, so while esbuild starts that process it's
 * pointed at Electron's own Node instead. (Turning off Electron's RunAsNode
 * fuse would break this.)
 */
function startEsbuildService(esbuild) {
  const spawn = childProcess.spawn;
  childProcess.spawn = (command, args, options) =>
    command === "node"
      ? spawn(
          process.execPath,
          args.map((arg) =>
            arg.replace(/app\.asar(?=[\\/])/, "app.asar.unpacked"),
          ),
          { ...options, env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" } },
        )
      : spawn(command, args, options);
  try {
    return esbuild.initialize({});
  } finally {
    childProcess.spawn = spawn;
  }
}

/** Loads esbuild the first time a plugin needs bundling. */
function loadEsbuild() {
  esbuildPromise ??= import("esbuild-wasm").then(async (mod) => {
    const esbuild = mod.default ?? mod;
    await startEsbuildService(esbuild);
    return esbuild;
  });
  return esbuildPromise;
}

/** Text files a plugin can import, as strings. */
const TEXT_LOADERS = {
  ".txt": "text",
  ".md": "text",
  ".csv": "text",
  ".svg": "text",
  ".glsl": "text",
  ".wgsl": "text",
  ".css": "text",
};

/**
 * Keeps every file the bundle reads inside the plugin's folder, apart from
 * the view client, and resolves `turtle:view` for views.
 */
function sandboxPlugin(folder, allowViewClient) {
  return {
    name: "turtle-sandbox",
    setup(build) {
      build.onResolve({ filter: /^turtle:view$/ }, () =>
        allowViewClient
          ? { path: "view-client", namespace: "turtle" }
          : {
              errors: [
                {
                  text: '"turtle:view" can only be imported by a view, not by the main script.',
                },
              ],
            },
      );
      // Read by us rather than esbuild so it also works from the app's asar.
      build.onLoad({ filter: /.*/, namespace: "turtle" }, async () => ({
        contents: await fs.readFile(SANDBOX_SCRIPTS.viewClient, "utf8"),
        loader: "js",
      }));
      build.onLoad({ filter: /.*/, namespace: "file" }, (args) => {
        if (!isInside(folder, args.path)) {
          return {
            errors: [
              {
                text: `"${args.path}" is outside the plugin's folder, so it can't be used.`,
              },
            ],
          };
        }
        return undefined;
      });
    },
  };
}

/**
 * Remembers bundles until one of the files that went into them changes, so
 * a view's scripts aren't rebuilt on every load.
 */
const cache = new Map();

async function unchanged(inputs) {
  for (const [file, mtimeMs] of inputs) {
    try {
      if ((await fs.stat(file)).mtimeMs !== mtimeMs) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/**
 * Bundles one script.
 * @param {string} folder The plugin folder's real path.
 * @param {string} entry The script's real path, inside the folder.
 * @param {"main" | "view"} target A plugin's main script (one classic
 *   script using the global `turtle`) or a view's script (an ES module).
 * @returns {Promise<string>} The bundled code.
 */
export async function bundle(folder, entry, target) {
  const key = `${target}:${entry}`;
  const cached = cache.get(key);
  if (cached && (await unchanged(cached.inputs))) return cached.code;

  const esbuild = await loadEsbuild();
  let result;
  try {
    result = await esbuild.build({
      entryPoints: [entry],
      absWorkingDir: folder,
      bundle: true,
      write: false,
      metafile: true,
      format: target === "main" ? "iife" : "esm",
      platform: "browser",
      target: "es2022",
      sourcemap: "inline",
      sourceRoot: `plugin://${path.basename(folder)}/`,
      loader: TEXT_LOADERS,
      logLevel: "silent",
      plugins: [sandboxPlugin(folder, target === "view")],
    });
  } catch (e) {
    if (/^The service (was stopped|is no longer running)/.test(e.message)) {
      // esbuild itself fell over, not the plugin's code; start it afresh
      // next time so other plugins still load.
      esbuild.stop();
      esbuildPromise = undefined;
    }
    const messages = e.errors?.map((err) => {
      // esbuild gives locations relative to absWorkingDir, the folder.
      const where = err.location
        ? `${path.relative(folder, path.resolve(folder, err.location.file))}:${err.location.line}: `
        : "";
      return `${where}${err.text}`;
    });
    throw new Error(messages?.join("\n") || e.message || String(e));
  }

  const code = result.outputFiles[0].text;
  const inputs = new Map();
  for (const input of Object.keys(result.metafile.inputs)) {
    const file = path.resolve(folder, input);
    try {
      inputs.set(file, (await fs.stat(file)).mtimeMs);
    } catch {
      // A virtual module; nothing to watch.
    }
  }
  cache.set(key, { code, inputs });
  return code;
}

/** Forgets cached bundles, e.g. after a plugin is replaced. */
export function clearBundleCache() {
  cache.clear();
}
