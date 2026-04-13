// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { FileInfo } from "../types";
import { DEFAULT_PROJECT_EXTENSION } from "./fileExtensions";

const DB_NAME = "TurtleTracerVirtualFS";
const STORE_NAME = "files";
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

// In-memory cache for faster reads
const fileCache = new Map<string, any>();
let cacheInitialized = false;
let initPromise: Promise<void> | null = null;

function getDB(): Promise<IDBDatabase> {
  dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(new Error(request.error?.message));
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
  return dbPromise;
}

async function initCache(): Promise<void> {
  if (cacheInitialized) return;
  if (initPromise !== null) return initPromise;

  initPromise = (async () => {
    const db = await getDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      const reqKeys = store.getAllKeys();

      tx.oncomplete = () => {
        const vals = req.result;
        const k = reqKeys.result;
        for (let i = 0; i < k.length; i++) {
          fileCache.set(k[i] as string, vals[i]);
        }
        cacheInitialized = true;
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    });
  })();

  return initPromise;
}

async function get(key: string): Promise<any> {
  await initCache();
  return fileCache.get(key);
}

async function set(key: string, value: any): Promise<void> {
  await initCache();
  fileCache.set(key, value);
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.put(value, key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function del(key: string): Promise<void> {
  await initCache();
  fileCache.delete(key);
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

async function keys(): Promise<string[]> {
  await initCache();
  return Array.from(fileCache.keys());
}

async function setMultiple(
  entries: { key: string; value: any }[],
): Promise<void> {
  await initCache();
  entries.forEach((e) => fileCache.set(e.key, e.value));
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    entries.forEach((e) => store.put(e.value, e.key));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function renameInDB(
  oldPath: string,
  newPath: string,
  value: any,
): Promise<void> {
  await initCache();
  fileCache.delete(oldPath);
  fileCache.set(newPath, value);
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(value, newPath);
    store.delete(oldPath);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// We treat "/" as root.
const VIRTUAL_ROOT = "/browser_fs";

// Simple path resolution
function resolvePath(base: string, relative: string): string {
  if (relative.startsWith("/")) return relative; // absolute

  const baseParts = base.split("/").filter(Boolean);

  // if base is a file, go to its directory
  if (base.includes(".") && !base.endsWith("/")) {
    baseParts.pop();
  }

  const relParts = relative.split("/").filter(Boolean);

  for (const part of relParts) {
    if (part === ".") continue;
    if (part === "..") {
      if (baseParts.length > 0) baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  return "/" + baseParts.join("/");
}

// Emulate File System structure in IndexedDB
// Key: full path string (e.g. "/browser_fs/project1/file.turt")
// Value: string (file content) OR object for directory (e.g. { type: "dir" })

export const browserFileSystem = {
  isVirtual: true,
  getDirectory: async (): Promise<string> => {
    await set(VIRTUAL_ROOT, { type: "dir" });
    return VIRTUAL_ROOT;
  },
  setDirectory: async (path?: string): Promise<string | null> => {
    if (!path) path = VIRTUAL_ROOT;
    await set(path, { type: "dir" });
    return path;
  },
  listFiles: async (directory: string): Promise<FileInfo[]> => {
    const allKeys = await keys();
    const files: FileInfo[] = [];
    const addedDirs = new Set<string>();

    const dirPrefix = directory.endsWith("/") ? directory : directory + "/";

    for (const key of allKeys) {
      if (key.startsWith(dirPrefix) && key !== directory) {
        const remaining = key.slice(dirPrefix.length);
        const parts = remaining.split("/").filter(Boolean);
        if (parts.length === 0) continue;

        const name = parts[0];
        const isDir = parts.length > 1;

        if (isDir) {
          if (!addedDirs.has(name)) {
            addedDirs.add(name);
            files.push({
              name,
              path: dirPrefix + name,
              size: 0,
              modified: new Date(),
              isDirectory: true,
            });
          }
        } else {
          const val = await get(key);
          if (val && val.type !== "dir") {
            files.push({
              name,
              path: key,
              size: typeof val === "string" ? val.length : 0,
              modified: new Date(),
              isDirectory: false,
            });
          } else if (val?.type === "dir") {
            if (!addedDirs.has(name)) {
              addedDirs.add(name);
              files.push({
                name,
                path: key,
                size: 0,
                modified: new Date(),
                isDirectory: true,
              });
            }
          }
        }
      }
    }
    return files;
  },
  readFile: async (filePath: string): Promise<string> => {
    const val = await get(filePath);
    if (!val || val.type === "dir") throw new Error("File not found");
    return val as string;
  },
  writeFile: async (filePath: string, content: string): Promise<boolean> => {
    // ensure parent dir exists
    const parts = filePath.split("/").filter(Boolean);
    parts.pop(); // remove filename
    if (parts.length > 0) {
      await setMultiple([
        { key: filePath, value: content },
        { key: "/" + parts.join("/"), value: { type: "dir" } },
      ]);
    } else {
      await set(filePath, content);
    }
    return true;
  },
  deleteFile: async (filePath: string): Promise<boolean> => {
    await del(filePath);
    return true;
  },
  fileExists: async (filePath: string): Promise<boolean> => {
    const val = await get(filePath);
    return val !== undefined && val !== null;
  },
  getSavedDirectory: async (): Promise<string> => {
    // just return virtual root if it exists
    const val = await get(VIRTUAL_ROOT);
    if (val) return VIRTUAL_ROOT;
    await set(VIRTUAL_ROOT, { type: "dir" });
    return VIRTUAL_ROOT;
  },
  createDirectory: async (dirPath: string): Promise<boolean> => {
    await set(dirPath, { type: "dir" });
    return true;
  },
  getDirectoryStats: async (dirPath: string): Promise<any> => {
    return { size: 0, files: 0 };
  },
  resolvePath: async (base: string, relative: string): Promise<string> => {
    return resolvePath(base, relative);
  },
  renameFile: async (
    oldPath: string,
    newPath: string,
  ): Promise<{ success: boolean; newPath: string }> => {
    const val = await get(oldPath);
    if (!val) throw new Error("File not found");
    await renameInDB(oldPath, newPath, val);
    return { success: true, newPath };
  },
  saveFile: async (
    content: string,
    path?: string,
  ): Promise<{ success: boolean; filepath: string; error?: string }> => {
    const target =
      path || VIRTUAL_ROOT + "/trajectory" + DEFAULT_PROJECT_EXTENSION;
    await set(target, content);
    return { success: true, filepath: target };
  },
  copyFile: async (src: string, dest: string): Promise<boolean> => {
    const val = await get(src);
    if (!val) throw new Error("Source file not found");
    await set(dest, val);
    return true;
  },
  showSaveDialog: async (options: any): Promise<string | null> => {
    const defaultName =
      options?.defaultPath || "trajectory" + DEFAULT_PROJECT_EXTENSION;
    return VIRTUAL_ROOT + "/" + defaultName;
  },
  openExternal: async (url: string): Promise<boolean> => {
    window.open(url, "_blank");
    return true;
  },
  rendererReady: async (): Promise<void> => {},
  makeRelativePath: async (base: string, target: string): Promise<string> => {
    // simple relative path for virtual fs
    const baseParts = base.split("/").filter(Boolean);
    if (base.includes(".") && !base.endsWith("/")) baseParts.pop();
    const targetParts = target.split("/").filter(Boolean);

    let commonLen = 0;
    while (
      commonLen < baseParts.length &&
      commonLen < targetParts.length &&
      baseParts[commonLen] === targetParts[commonLen]
    ) {
      commonLen++;
    }

    const up = baseParts.length - commonLen;
    const rel = new Array(up)
      .fill("..")
      .concat(targetParts.slice(commonLen))
      .join("/");
    return rel || ".";
  },
};
