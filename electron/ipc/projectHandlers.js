// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Looking through a robot project, to find what the code Turtle Tracer writes
// has to match: where the team keeps its Pedro constants, for one.
import { ipcMain } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { validateArbitraryPath } from "../utils.js";

/** Folders that never hold a team's own code. */
const SKIPPED_FOLDERS = new Set(["build", "node_modules", "out", "libs"]);
const MAX_DEPTH = 20;
const MAX_RESULTS = 500;

/**
 * The files under `root` whose names end with one of `endings`, skipping
 * build output and hidden folders. Stops at `maxDepth` folders deep and
 * `maxResults` files.
 */
export async function findFilesUnder(root, endings, options = {}) {
  const wanted = Array.isArray(endings)
    ? endings.filter((e) => typeof e === "string" && e.length > 0)
    : [];
  if (wanted.length === 0) return [];
  const maxDepth = Math.min(Number(options.maxDepth) || 12, MAX_DEPTH);
  const maxResults = Math.min(Number(options.maxResults) || 50, MAX_RESULTS);
  const found = [];

  async function walk(dir, depth) {
    if (depth > maxDepth || found.length >= maxResults) return;
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (found.length >= maxResults) return;
      if (entry.isDirectory()) {
        if (entry.name.startsWith(".") || SKIPPED_FOLDERS.has(entry.name)) {
          continue;
        }
        await walk(path.join(dir, entry.name), depth + 1);
      } else if (
        entry.isFile() &&
        wanted.some((ending) => entry.name.endsWith(ending))
      ) {
        found.push(path.join(dir, entry.name));
      }
    }
  }

  await walk(root, 0);
  return found;
}

export function registerProjectHandlers() {
  ipcMain.handle(
    "project:find-files",
    async (event, root, endings, options) => {
      let resolved;
      try {
        resolved = validateArbitraryPath(root);
      } catch {
        return [];
      }
      return findFilesUnder(resolved, endings, options);
    },
  );
}
