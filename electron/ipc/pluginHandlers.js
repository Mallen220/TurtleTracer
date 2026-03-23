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
    const pluginsDir = getPluginsDirectory();
    try {
      await fs.mkdir(pluginsDir, { recursive: true });
      const files = await fs.readdir(pluginsDir);
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
    const pluginsDir = getPluginsDirectory();
    if (filename.includes("/") || filename.includes("\\")) {
      throw new Error("Invalid plugin filename");
    }
    const filePath = path.join(pluginsDir, filename);
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      console.error("Error reading plugin:", error);
      throw error;
    }
  });

  ipcMain.handle("plugins:open-folder", async () => {
    const pluginsDir = getPluginsDirectory();
    try {
      await fs.mkdir(pluginsDir, { recursive: true });
      await shell.openPath(pluginsDir);
      return true;
    } catch (error) {
      console.error("Error opening plugins folder:", error);
      return false;
    }
  });

  ipcMain.handle("plugins:delete", async (event, filename) => {
    const pluginsDir = getPluginsDirectory();
    if (filename.includes("/") || filename.includes("\\")) {
      throw new Error("Invalid plugin filename");
    }
    const filePath = path.join(pluginsDir, filename);
    try {
      await fs.unlink(filePath);
      return true;
    } catch (error) {
      console.error("Error deleting plugin:", error);
      throw error;
    }
  });
}
