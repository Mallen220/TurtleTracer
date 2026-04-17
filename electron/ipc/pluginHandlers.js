// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain, shell } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import ts from "typescript";
import { getPluginsDirectory } from "../utils.js";

function getSafePluginsDirectory() {
  const pluginsDir = path.resolve(getPluginsDirectory());
  if (!path.isAbsolute(pluginsDir)) {
    throw new Error("Invalid plugins directory");
  }
  return pluginsDir;
}

/**
 * Resolves a plugin file path securely.
 * @param {string} basePath
 * @param {string} filename
 * @returns {Promise<string>} The resolved path.
 */
async function resolvePluginFilePath(basePath, filename) {
  if (typeof filename !== "string") {
    throw new TypeError("Invalid plugin filename");
  }

  const safeFilename = path.basename(filename);
  const isInvalidName =
    safeFilename.length === 0 ||
    safeFilename !== filename ||
    safeFilename === "." ||
    safeFilename === "..";

  if (isInvalidName) {
    throw new Error("Invalid plugin filename");
  }

  if (!/^[A-Za-z0-9._-]+\.(js|ts)$/u.test(safeFilename)) {
    throw new Error("Invalid plugin filename");
  }

  const entries = await fs.readdir(basePath, { withFileTypes: true });
  const matchedEntry = entries.find(
    (entry) => entry.isFile() && entry.name === safeFilename,
  );
  if (!matchedEntry) {
    throw new Error("Plugin not found");
  }

  const fullPath = path.normalize(`${basePath}${path.sep}${matchedEntry.name}`);
  const baseWithSep = basePath.endsWith(path.sep)
    ? basePath
    : `${basePath}${path.sep}`;
  const relativePath = path.relative(basePath, fullPath);
  if (
    !fullPath.startsWith(baseWithSep) ||
    relativePath.startsWith("..") ||
    path.isAbsolute(relativePath) ||
    relativePath.length === 0
  ) {
    throw new Error("Invalid path specified");
  }

  return fullPath;
}

export function registerPluginHandlers() {
  ipcMain.handle("plugins:transpile", async (event, code) => {
    try {
      const result = ts.transpileModule(code, {
        compilerOptions: {
          target: ts.ScriptTarget.ES2020,
          module: ts.ModuleKind.None,
        },
      });
      return result.outputText;
    } catch (error) {
      console.error("Error transpiling plugin:", error);
      throw new Error(
        `Transpilation failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });

  ipcMain.handle("plugins:list", async () => {
    const fullPath = getSafePluginsDirectory();
    try {
      await fs.mkdir(fullPath, { recursive: true });
      const files = await fs.readdir(fullPath);
      return files.filter(
        (f) =>
          (f.endsWith(".js") || f.endsWith(".ts")) &&
          !f.endsWith("turtle.d.ts"),
      );
    } catch (error) {
      console.error("Error listing plugins:", error);
      return [];
    }
  });

  ipcMain.handle("plugins:read", async (event, filename) => {
    const basePath = getSafePluginsDirectory();
    const fullPath = await resolvePluginFilePath(basePath, filename);
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch (error) {
      console.error("Error reading plugin:", error);
      throw error;
    }
  });

  ipcMain.handle("plugins:open-folder", async () => {
    const fullPath = getSafePluginsDirectory();
    try {
      // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
      await fs.mkdir(fullPath, { recursive: true });
      await shell.openPath(fullPath);
      return true;
    } catch (error) {
      console.error("Error opening plugins folder:", error);
      return false;
    }
  });

  ipcMain.handle("plugins:delete", async (event, filename) => {
    const basePath = getSafePluginsDirectory();
    const fullPath = await resolvePluginFilePath(basePath, filename);
    try {
      // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      console.error("Error deleting plugin:", error);
      throw error;
    }
  });
}
