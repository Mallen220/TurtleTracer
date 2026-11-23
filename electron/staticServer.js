// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Serves the built UI (dist/) to the app window on localhost. The window loads
// it over http rather than file:// so its address, and so the settings and
// robot profiles the page keeps in localStorage, stay the same between runs.
import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
};

/**
 * No script from another site may run in the app window, which has file system
 * access. Inline and eval'd script stay allowed: the page has inline scripts
 * and plugins are compiled with `new Function`.
 */
const CONTENT_SECURITY_POLICY =
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'; object-src 'none'; base-uri 'self'";

function reply(res, status, headers = {}) {
  res.writeHead(status, headers);
  res.end();
}

/** The file `urlPath` names inside `root`, or null if it is anything else. */
async function findFile(root, urlPath) {
  const file = path.join(root, urlPath);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  try {
    const stats = await fs.stat(file);
    return stats.isFile() ? { file, stats } : null;
  } catch {
    return null;
  }
}

/**
 * A request handler for `http.createServer` that serves the files under
 * `root`. A page address with no file extension (a route of the single-page
 * app) gets index.html; a missing file with an extension is a 404.
 */
export function createStaticHandler(root) {
  const base = path.resolve(root);

  return async (req, res) => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") {
        return reply(res, 405, { Allow: "GET, HEAD" });
      }

      let urlPath;
      try {
        urlPath = decodeURIComponent(
          new URL(req.url, "http://localhost").pathname,
        );
      } catch {
        return reply(res, 400);
      }
      if (urlPath.includes("\0")) return reply(res, 400);
      // Hidden files (.DS_Store and the like) aren't part of the app, and a
      // ".." that survived decoding is an attempt to leave it.
      if (urlPath.split(/[\\/]/).some((part) => part.startsWith("."))) {
        return reply(res, 404);
      }

      let found = await findFile(base, urlPath);
      if (!found) {
        if (path.extname(urlPath) !== "") return reply(res, 404);
        found = await findFile(base, "index.html");
        if (!found) return reply(res, 404);
      }

      const { file, stats } = found;
      const etag = `W/"${stats.size}-${Math.round(stats.mtimeMs)}"`;
      const headers = {
        "Content-Type":
          CONTENT_TYPES[path.extname(file).toLowerCase()] ??
          "application/octet-stream",
        // Always check with the server, which answers 304 when nothing changed.
        "Cache-Control": "no-cache",
        ETag: etag,
        "Content-Security-Policy": CONTENT_SECURITY_POLICY,
        "Last-Modified": stats.mtime.toUTCString(),
      };
      if (req.headers["if-none-match"] === etag)
        return reply(res, 304, headers);

      res.writeHead(200, { ...headers, "Content-Length": stats.size });
      if (req.method === "HEAD") return res.end();
      pipeline(fsSync.createReadStream(file), res, (error) => {
        if (error) res.destroy();
      });
    } catch (error) {
      console.error("Error serving", req.url, error);
      if (res.headersSent) res.destroy();
      else reply(res, 500);
    }
  };
}
