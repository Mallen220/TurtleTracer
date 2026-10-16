// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// turtle-plugin://<id>/<path> serves a plugin's views and their files. Each
// plugin gets its own origin, and its views load in sandboxed frames with a
// policy that allows nothing but the plugin's own files: no network, no
// other plugins, no app.
import fs from "node:fs/promises";
import path from "node:path";
import { protocol } from "electron";
import { SANDBOX_SCRIPTS, bundle } from "./bundler.js";
import { fileInPlugin, isPluginId, pluginFolder } from "./files.js";
import { readManifest } from "./manifest.js";

export const SCHEME = "turtle-plugin";

/** Must run before the app is ready. */
export function registerPluginScheme() {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    },
  ]);
}

const SCRIPT = /\.(ts|tsx|js|mjs|jsx)$/i;
const JS = "text/javascript; charset=utf-8";

/**
 * The hidden page a plugin's main script runs in. The runtime connects to
 * the app, then loads /__turtle/main.js (the plugin's bundled main script).
 */
const MAIN_PAGE = `<!doctype html>
<html><head><meta charset="utf-8"><script src="/__turtle/runtime.js"></script></head><body></body></html>`;

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".wasm": "application/wasm",
  ".glb": "model/gltf-binary",
  ".gltf": "model/gltf+json",
  ".bin": "application/octet-stream",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".mp4": "video/mp4",
  ".txt": "text/plain; charset=utf-8",
};

/** The Content-Security-Policy for one plugin's views. */
export function viewPolicy(id) {
  const self = `${SCHEME}://${id}`;
  return [
    "default-src 'none'",
    `script-src ${self} 'wasm-unsafe-eval'`,
    `style-src ${self} 'unsafe-inline'`,
    `img-src ${self} data: blob:`,
    `font-src ${self} data:`,
    `connect-src ${self} data: blob:`,
    `media-src ${self} data: blob:`,
    `worker-src ${self} blob:`,
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors http://localhost:*",
  ].join("; ");
}

function respond(status, body, type, id) {
  const headers = {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    // The view's origin is opaque (sandboxed), so its own module scripts
    // and fetches are cross-origin requests.
    "Access-Control-Allow-Origin": "*",
  };
  if (id) headers["Content-Security-Policy"] = viewPolicy(id);
  return new Response(body, { status, headers });
}

/**
 * Handles turtle-plugin:// requests. Only enabled plugins are served.
 * @param {() => string} getPluginsDir
 * @param {(id: string) => Promise<boolean>} isEnabled
 */
export function handlePluginProtocol(getPluginsDir, isEnabled) {
  protocol.handle(SCHEME, (request) =>
    servePluginFile(request.url, getPluginsDir(), isEnabled),
  );
}

/**
 * The response for one turtle-plugin:// URL. Exported for tests.
 * @param {string} url
 * @param {string} pluginsDir
 * @param {(id: string) => Promise<boolean>} isEnabled
 */
export async function servePluginFile(url, pluginsDir, isEnabled) {
  const notFound = () => respond(404, "Not found", "text/plain");
  let id;
  let relativePath;
  try {
    const parsed = new URL(url);
    id = parsed.hostname;
    relativePath = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  } catch {
    return notFound();
  }
  if (!isPluginId(id) || !(await isEnabled(id))) return notFound();

  let folder;
  try {
    folder = await pluginFolder(pluginsDir, id);
  } catch {
    return notFound();
  }

  // Our own files for running the plugin.
  if (relativePath.startsWith("__turtle/")) {
    return (await serveSandboxFile(relativePath, folder, id)) ?? notFound();
  }

  const file = await fileInPlugin(folder, relativePath).catch(() => null);
  if (!file) return notFound();

  if (SCRIPT.test(file)) return bundledScript(folder, file, "view", id);

  const type =
    TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
  return respond(200, await fs.readFile(file), type, id);
}

/**
 * A script built for the sandbox. A build error is thrown there instead, and
 * a view also shows it in place of itself, for whoever is writing the plugin.
 */
async function bundledScript(folder, file, target, id) {
  try {
    return respond(200, await bundle(folder, file, target), JS, id);
  } catch (e) {
    const name = path.relative(folder, file);
    const message = JSON.stringify(`Couldn't build ${name}:\n${e.message}`);
    const show =
      target === "view"
        ? `const pre = document.createElement("pre");
pre.textContent = ${message};
Object.assign(pre.style, { whiteSpace: "pre-wrap", color: "#dc2626", padding: "1rem" });
document.body?.replaceChildren(pre);
`
        : "";
    return respond(200, `${show}throw new Error(${message});`, JS, id);
  }
}

/** The page, runtime and main script a plugin's logic runs in. */
async function serveSandboxFile(relativePath, folder, id) {
  switch (relativePath) {
    case "__turtle/main.html":
      return respond(200, MAIN_PAGE, TYPES[".html"], id);
    case "__turtle/runtime.js":
      return respond(200, await fs.readFile(SANDBOX_SCRIPTS.runtime), JS, id);
    case "__turtle/main.js": {
      const result = await readManifest(folder);
      if ("error" in result || !result.manifest.main) return null;
      const entry = await fileInPlugin(folder, result.manifest.main);
      return entry ? bundledScript(folder, entry, "main", id) : null;
    }
    default:
      return null;
  }
}
