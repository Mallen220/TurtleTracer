// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Turns a plugin's TypeScript or JavaScript, and the npm packages it
// imports, into one file the sandbox can run. Uses esbuild's WebAssembly
// build, so it works the same on every platform. Nothing outside the
// plugin's folder can be bundled in.
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

/** Loads esbuild the first time a plugin needs bundling. */
function loadEsbuild() {
  esbuildPromise ??= import("esbuild-wasm").then(async (mod) => {
    const esbuild = mod.default ?? mod;
    await esbuild.initialize({});
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
    const messages = e.errors?.map((err) => {
      const where = err.location
        ? `${path.relative(folder, err.location.file) || err.location.file}:${err.location.line}: `
        : "";
      return `${where}${err.text}`;
    });
    throw new Error(messages?.join("\n") || String(e));
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
