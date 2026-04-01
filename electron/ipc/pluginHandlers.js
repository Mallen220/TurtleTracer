// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { ipcMain, shell } from "electron";
import fs from "fs/promises";
import path from "path";
import ts from "typescript";
import { getPluginsDirectory } from "../utils.js";

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
      throw new Error(`Transpilation failed: ${error.message}`);
    }
  });

  ipcMain.handle("plugins:list", async () => {
    const basePath = getPluginsDirectory();
    const fullPath = path.normalize(basePath);
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Invalid path specified");
    }
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
    const basePath = getPluginsDirectory();
    if (filename.includes("/") || filename.includes("\\")) {
      throw new Error("Invalid plugin filename");
    }
    const joinedPath = path.join(basePath, path.basename(filename));
    const fullPath = path.normalize(joinedPath);
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Invalid path specified");
    }
    try {
      return await fs.readFile(fullPath, "utf-8");
    } catch (error) {
      console.error("Error reading plugin:", error);
      throw error;
    }
  });

  ipcMain.handle("plugins:open-folder", async () => {
    const basePath = getPluginsDirectory();
    const fullPath = path.normalize(basePath);
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Invalid path specified");
    }
    try {
      await fs.mkdir(fullPath, { recursive: true });
      await shell.openPath(fullPath);
      return true;
    } catch (error) {
      console.error("Error opening plugins folder:", error);
      return false;
    }
  });

  ipcMain.handle("plugins:delete", async (event, filename) => {
    const basePath = getPluginsDirectory();
    if (filename.includes("/") || filename.includes("\\")) {
      throw new Error("Invalid plugin filename");
    }
    const joinedPath = path.join(basePath, path.basename(filename));
    const fullPath = path.normalize(joinedPath);
    if (!fullPath.startsWith(basePath)) {
      throw new Error("Invalid path specified");
    }
    try {
      await fs.unlink(fullPath);
      return true;
    } catch (error) {
      console.error("Error deleting plugin:", error);
      throw error;
    }
  });
}
