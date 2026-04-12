// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISCORD_ISSUES: string;
  readonly VITE_DISCORD_RATINGS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "prettier-plugin-java";

declare global {
  interface Window {
    electronAPI: any;
  }
  var electronAPI: {
    getDirectory: () => Promise<string | null>;
    setDirectory: (path?: string) => Promise<string | null>;
    listFiles: (directory: string) => Promise<any[]>;
    readFile: (filePath: string) => Promise<string>;
    writeFile: (
      filePath: string,
      content: string,
    ) => Promise<{ success: boolean; filepath: string; error?: string }>;
    deleteFile: (filePath: string) => Promise<boolean>;
    fileExists: (filePath: string) => Promise<boolean>;
    getSavedDirectory: () => Promise<string>;
    createDirectory: (dirPath: string) => Promise<boolean>;
    getDirectoryStats: (dirPath: string) => Promise<any>;
    renameFile: (
      oldPath: string,
      newPath: string,
    ) => Promise<{ success: boolean; newPath: string }>;
    resolvePath?: (base: string, relative: string) => Promise<string>;
    makeRelativePath?: (base: string, relative: string) => Promise<string>;
    copyFile?: (source: string, dest: string) => Promise<boolean>;
  };
}
