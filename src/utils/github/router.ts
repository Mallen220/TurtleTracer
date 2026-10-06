// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Sends file operations on GitHub paths (/@github/...) to the GitHub working
// copy and everything else to the device's file system, so the rest of the
// app opens, saves and exports files in a repository the same way as on disk.
import type { ElectronAPI } from "../../types";
import { isGitHubPath, relativeGitHubPath, resolveGitHubPath } from "./paths";
import { githubRepos, type GitHubRepos } from "./repos";

const routers = new WeakMap<ElectronAPI, ElectronAPI>();

/** `base` with GitHub paths handled by `repos`. The same object is returned for the same `base`. */
export function withGitHubRepos(
  base: ElectronAPI,
  repos: GitHubRepos = githubRepos,
): ElectronAPI {
  let router = routers.get(base);
  if (!router) {
    router = createRouter(base, repos);
    routers.set(base, router);
  }
  return router;
}

function createRouter(base: ElectronAPI, repos: GitHubRepos): ElectronAPI {
  // Anything not overridden here (dialogs, plugins, updates...) is looked up
  // on `base` when it's used.
  const router: ElectronAPI = Object.create(base);
  const gh = isGitHubPath;

  /**
   * Adds an operation every file system has. It is defined rather than
   * assigned: the desktop app's API is frozen, and assigning over a frozen
   * property it inherits from would throw.
   */
  function always<K extends keyof ElectronAPI>(
    name: K,
    routed: NonNullable<ElectronAPI[K]>,
  ) {
    Object.defineProperty(router, name, { value: routed, enumerable: true });
  }

  /**
   * Adds an operation `base` may not have. It is only offered while `base`
   * has it, since callers check for optional operations before using them.
   */
  function optional<K extends keyof ElectronAPI>(
    name: K,
    routed: NonNullable<ElectronAPI[K]>,
  ) {
    Object.defineProperty(router, name, {
      get: () => (typeof base[name] === "function" ? routed : undefined),
      enumerable: true,
    });
  }

  always("listFiles", (dir) =>
    gh(dir) ? repos.listFiles(dir) : base.listFiles(dir),
  );
  always("readFile", (path) =>
    gh(path) ? repos.readFile(path) : base.readFile(path),
  );
  always("writeFile", (path, content) =>
    gh(path) ? repos.writeFile(path, content) : base.writeFile(path, content),
  );
  always("deleteFile", (path) =>
    gh(path) ? repos.deleteFile(path) : base.deleteFile(path),
  );
  always("fileExists", (path) =>
    gh(path) ? repos.fileExists(path) : base.fileExists(path),
  );

  optional("resolvePath", async (from, relative) =>
    gh(from)
      ? resolveGitHubPath(from, relative)
      : base.resolvePath!(from, relative),
  );
  optional("makeRelativePath", async (from, target) =>
    gh(from) || gh(target)
      ? relativeGitHubPath(from, target)
      : base.makeRelativePath!(from, target),
  );
  optional("createDirectory", (dir) =>
    gh(dir) ? repos.createDirectory(dir) : base.createDirectory!(dir),
  );
  optional("getDirectoryStats", (dir) =>
    gh(dir) ? repos.getDirectoryStats(dir) : base.getDirectoryStats!(dir),
  );
  optional("renameFile", async (from, to) => {
    if (gh(from) && gh(to)) return repos.renameFile(from, to);
    if (gh(from) || gh(to)) {
      throw new Error(
        "Files can't be moved between GitHub and this device. Copy them instead.",
      );
    }
    return base.renameFile!(from, to);
  });
  optional("copyFile", async (from, to) =>
    gh(from) || gh(to)
      ? router.writeFile(to, await router.readFile(from))
      : base.copyFile!(from, to),
  );
  optional("saveFile", (content, path) =>
    path && gh(path)
      ? repos.saveFile(content, path)
      : base.saveFile!(content, path),
  );
  optional("writeFileBase64", async (path, data) => {
    if (gh(path)) {
      throw new Error(
        "Images and animations can't be saved into a GitHub repository. Save them on this device.",
      );
    }
    return base.writeFileBase64!(path, data);
  });

  // Diff mode and the changed-file badges work for repositories on any
  // platform; elsewhere they use git on disk if the desktop app has it.
  always("gitShow", async (path) =>
    gh(path) ? repos.gitShow(path) : ((await base.gitShow?.(path)) ?? null),
  );
  always("gitStatus", async (dir) =>
    gh(dir) ? repos.gitStatus(dir) : ((await base.gitStatus?.(dir)) ?? {}),
  );

  return router;
}
