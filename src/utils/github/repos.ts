// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Working copies of GitHub repositories. Files are downloaded as they are
// opened, edits are kept here until they are committed, and a commit sends
// every edited file to GitHub at once.
import { writable } from "svelte/store";
import type { FileInfo } from "../../types";
import {
  createGitHubClient,
  desktopFetch,
  GitHubError,
  type GitHubClient,
} from "./api";
import type { GitHubLink } from "./links";
import { splitRef } from "./links";
import {
  githubPath,
  parentOf,
  parseGitHubPath,
  repoKey,
  type RepoRef,
} from "./paths";
import {
  indexedDbRepoStorage,
  type RepoRecord,
  type RepoStorage,
} from "./storage";
import { getGitHubToken } from "./token";
import {
  checkRemove,
  checkWrite,
  FOLDER_RULE,
  isProjectFile,
  RepoRuleError,
} from "./rules";

/** Where FTC projects keep the paths TurtleTracerLib reads. */
export const AUTO_PATHS_FOLDER = "TeamCode/src/main/assets/AutoPaths";

/** Files bigger than this aren't opened or written (path projects are tiny). */
export const MAX_FILE_BYTES = 5_000_000;

export type ChangeStatus = "added" | "modified" | "deleted";

export interface RepoChange {
  /** App path of the file. */
  path: string;
  repoPath: string;
  status: ChangeStatus;
}

export interface RepoSummary extends RepoRef {
  branch: string;
  changeCount: number;
}

/** What a pasted link points at, once GitHub has been asked. */
export interface LinkTarget extends RepoRef {
  kind: GitHubLink["kind"];
  defaultBranch: string;
  branches: string[];
  /** The branch the link names, or the default branch. */
  branch: string;
  /** The folder or file the link names, "" for the whole repository. */
  path: string;
}

/**
 * "3 changes in team/robot" for repositories with edits not committed yet,
 * or null when everything is committed.
 */
export function describeUncommitted(summaries: RepoSummary[]): string | null {
  const pending = summaries.filter((s) => s.changeCount > 0);
  if (pending.length === 0) return null;
  return pending
    .map(
      (s) =>
        `${s.changeCount} change${s.changeCount === 1 ? "" : "s"} in ${repoKey(s)}`,
    )
    .join(" and ");
}

/** A repository the user has just opened, and where to start. */
export interface OpenedRepo {
  record: RepoRecord;
  /** App path of the folder to show. */
  folder: string;
  /** App path of the file the link named, to open straight away. */
  file?: string;
}

/**
 * What to do with files edited both here and on GitHub: keep the edit made
 * here (committing it replaces GitHub's), take GitHub's, or take GitHub's and
 * keep this device's version as a copy next to it.
 */
export type Resolution = "mine" | "theirs" | "both";

export type UpdateResult =
  | { status: "up-to-date" }
  | {
      status: "updated";
      /** Files that changed on GitHub, as app paths. */
      changedOnGitHub: string[];
      /** Copies kept of this device's versions, for "both". */
      copies: string[];
    }
  /** Files edited here and on GitHub; nothing was updated. */
  | { status: "conflicts"; conflicts: string[] };

export interface CommitResult {
  sha: string;
  url: string;
  branch: string;
  /** A link to open a pull request, after committing to a new branch. */
  pullRequestUrl?: string;
}

/**
 * Lets one tab or window at a time change repositories, so two can't
 * overwrite each other's edits. The others can still look.
 */
export interface EditingLock {
  held(): boolean;
  /** Resolves once this tab may edit. */
  acquired: Promise<void>;
}

const alwaysHeld: EditingLock = {
  held: () => true,
  acquired: Promise.resolve(),
};

/** The editing lock shared by every Turtle Tracer tab in this browser. */
export function browserEditingLock(): EditingLock {
  const locks = globalThis.navigator?.locks;
  // Browsers without Web Locks are older than any that run the app.
  if (!locks) return alwaysHeld;
  let held = false;
  const acquired = new Promise<void>((resolve) => {
    void locks.request("turtle-tracer-github-editing", () => {
      held = true;
      resolve();
      // Held until this tab closes; then the next tab waiting gets it.
      return new Promise<void>(() => {});
    });
  });
  return { held: () => held, acquired };
}

export const OTHER_TAB_MESSAGE =
  "Your GitHub repositories are being edited in another Turtle Tracer tab or window. Close it to edit them here.";

/** Saving would replace a version of the file someone committed since it was opened. */
export class StaleFileError extends Error {
  constructor(readonly path: string) {
    super(
      `${path.split("/").pop()} changed on GitHub since you opened it, so it wasn't saved. Save anyway to replace their version with yours, or reopen the file to see theirs.`,
    );
    this.name = "StaleFileError";
  }
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;
const now = () => new Date().toISOString();
const sizeText = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** A project's JSON with keys in a fixed order and no app version, to compare. */
function projectWithoutVersion(text: string): string | null {
  try {
    const sorted = (value: unknown): unknown =>
      Array.isArray(value)
        ? value.map(sorted)
        : value && typeof value === "object"
          ? Object.fromEntries(
              Object.keys(value)
                .sort()
                .map((k) => [k, sorted((value as Record<string, unknown>)[k])]),
            )
          : value;
    const { version: _version, ...rest } = JSON.parse(text);
    return JSON.stringify(sorted(rest));
  } catch {
    return null;
  }
}

/** A name for a copy of `repoPath` that no file has: "Far (my version).turt". */
function copyName(repoPath: string, taken: (path: string) => boolean) {
  const dot = repoPath.lastIndexOf(".");
  const stem =
    dot > repoPath.lastIndexOf("/") ? repoPath.slice(0, dot) : repoPath;
  const ext = repoPath.slice(stem.length);
  for (let n = 1; ; n++) {
    const candidate = `${stem} (my version${n > 1 ? ` ${n}` : ""})${ext}`;
    if (!taken(candidate)) return candidate;
  }
}

/** Git's id for a file with these contents (what `git hash-object` prints). */
export async function gitBlobSha(content: string): Promise<string> {
  const body = new TextEncoder().encode(content);
  const header = new TextEncoder().encode(`blob ${body.length}\0`);
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header);
  bytes.set(body, header.length);
  const digest = await crypto.subtle.digest("SHA-1", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class GitHubRepos {
  /** The open repositories, for the UI. */
  readonly summaries = writable<RepoSummary[]>([]);
  /** False while another tab or window is editing repositories. */
  readonly editable = writable(true);

  #client: GitHubClient;
  #storage: RepoStorage;
  #lock: EditingLock;
  /** Tells other tabs when a repository changes, so they can reload it. */
  #channel: BroadcastChannel | null;
  #records = new Map<string, RepoRecord>();
  #loaded: Promise<void> | null = null;
  #saving = new Map<string, Promise<void>>();
  /** Downloaded file contents by git id, and downloads in progress. */
  #blobs = new Map<string, string>();
  #downloads = new Map<string, Promise<string>>();
  /** GitHub's version of each project open in the editor, when it was opened. */
  #openedVersions = new Map<string, string | null>();

  constructor(
    client: GitHubClient,
    storage: RepoStorage,
    lock: EditingLock = alwaysHeld,
    channel: BroadcastChannel | null = null,
  ) {
    this.#client = client;
    this.#storage = storage;
    this.#lock = lock;
    this.#channel = channel;
    this.editable.set(lock.held());
    void lock.acquired.then(async () => {
      this.editable.set(true);
      // The tab that was editing may have changed things in the meantime.
      if (this.#loaded) await this.#reload();
    });
    channel?.addEventListener("message", () => {
      if (!this.#lock.held()) void this.#reload();
    });
  }

  /** Loads the repositories opened before. */
  ready(): Promise<void> {
    this.#loaded ??= this.#reload();
    return this.#loaded;
  }

  async #reload() {
    const records = await this.#storage.loadRepos();
    this.#records = new Map(records.map((r) => [repoKey(r), r]));
    this.#publish();
  }

  #checkEditable() {
    if (!this.#lock.held()) throw new Error(OTHER_TAB_MESSAGE);
  }

  async get(ref: RepoRef): Promise<RepoRecord | undefined> {
    await this.ready();
    return this.#records.get(repoKey(ref));
  }

  // --- Opening and closing ---

  /** Asks GitHub what a pasted link points at. */
  async lookUp(link: GitHubLink): Promise<LinkTarget> {
    const info = await this.#client.getRepo(link.owner, link.repo);
    if (info.isPrivate) {
      throw new GitHubError(
        "Private repositories aren't supported yet.",
        "forbidden",
      );
    }
    const branches = await this.#client.listBranches(info.owner, info.repo);
    if (!branches.includes(info.defaultBranch)) {
      branches.unshift(info.defaultBranch);
    }

    let branch = info.defaultBranch;
    let path = "";
    if (link.kind !== "repo") {
      const split = splitRef(link.refAndPath, branches);
      if (!split) {
        throw new GitHubError(
          "That link points at a tag or a single commit, which can't be edited. Use a link to a branch.",
          "other",
        );
      }
      ({ branch, path } = split);
    }
    return {
      owner: info.owner,
      repo: info.repo,
      kind: link.kind,
      defaultBranch: info.defaultBranch,
      branches,
      branch,
      path,
    };
  }

  /**
   * Opens a branch of a repository. If the repository is already open on
   * that branch with uncommitted edits, they are kept; otherwise its file
   * list is downloaded again.
   */
  async open(ref: RepoRef, branch: string): Promise<RepoRecord> {
    await this.ready();
    this.#checkEditable();
    // Ask the browser not to clear this site's storage when space runs low.
    void globalThis.navigator?.storage?.persist?.().catch(() => false);
    const key = repoKey(ref);
    const existing = this.#records.get(key);
    const hasEdits = existing && Object.keys(existing.changes).length > 0;
    if (existing && hasEdits) {
      if (existing.branch === branch) return existing;
      throw new Error(
        `${key} has changes on ${existing.branch} that aren't committed. Open it and use Switch branch to take them to ${branch}, or commit or discard them first.`,
      );
    }

    const headSha = await this.#client.getBranchHead(
      ref.owner,
      ref.repo,
      branch,
    );
    const { files, truncated } = await this.#client.getFiles(
      ref.owner,
      ref.repo,
      headSha,
    );
    if (truncated) {
      throw new Error(`${key} has too many files to open here.`);
    }

    const record: RepoRecord = {
      owner: ref.owner,
      repo: ref.repo,
      branch,
      headSha,
      syncedAt: now(),
      files: Object.fromEntries(
        files.map((f) => [f.path, { sha: f.sha, size: f.size }]),
      ),
      changes: {},
      folders: [],
      lastFolder: existing?.branch === branch ? existing.lastFolder : undefined,
    };
    this.#records.set(key, record);
    if (existing) this.#forgetUnusedBlobs(existing);
    await this.#save(record);
    return record;
  }

  /** Removes the working copy, including any uncommitted edits. */
  async close(ref: RepoRef): Promise<void> {
    await this.ready();
    this.#checkEditable();
    const key = repoKey(ref);
    const record = this.#records.get(key);
    if (!record) return;
    this.#records.delete(key);
    await this.#saving.get(key);
    await this.#storage.deleteRepo(key);
    this.#forgetUnusedBlobs(record);
    this.#publish();
    this.#channel?.postMessage(key);
  }

  /**
   * The folder to show first: the one a link named, the one browsed last
   * time, the AutoPaths folder, or wherever the project files are.
   */
  startFolder(record: RepoRecord, linkPath = ""): string {
    const candidates = [
      linkPath && this.#isFolder(record, linkPath) ? linkPath : null,
      linkPath && this.#isFile(record, linkPath) ? parentOf(linkPath) : null,
      record.lastFolder && this.#isFolder(record, record.lastFolder)
        ? record.lastFolder
        : null,
      this.#isFolder(record, AUTO_PATHS_FOLDER) ? AUTO_PATHS_FOLDER : null,
      commonFolder(
        [...this.#currentFiles(record)].filter((p) => isProjectFile(p)),
      ),
    ];
    return githubPath(record, candidates.find((c) => c !== null) ?? "");
  }

  /** Remembers the folder being browsed, to come back to it. */
  async rememberFolder(dir: string): Promise<void> {
    const { record, repoPath } = await this.#locate(dir);
    if (record.lastFolder === repoPath || !this.#lock.held()) return;
    record.lastFolder = repoPath;
    await this.#save(record).catch(() => {});
  }

  /**
   * Remembers which version of a project the editor is showing, so saving
   * it can't quietly replace a version someone committed since.
   */
  async noteOpened(path: string): Promise<void> {
    const { record, repoPath } = await this.#locate(path);
    this.#openedVersions.set(path, record.files[repoPath]?.sha ?? null);
  }

  /** After a StaleFileError: the next save replaces GitHub's version. */
  async acceptGitHubVersion(path: string): Promise<void> {
    await this.noteOpened(path);
  }

  // --- Files (the same operations as the desktop app's file system) ---

  async listFiles(dir: string): Promise<FileInfo[]> {
    const { record, repoPath } = await this.#locate(dir);
    if (!this.#isFolder(record, repoPath)) {
      throw new Error(`Folder not found: ${repoPath || "/"}`);
    }
    const prefix = repoPath ? repoPath + "/" : "";
    const synced = new Date(record.syncedAt);
    const entries = new Map<string, FileInfo>();
    const addFolder = (name: string) => {
      if (entries.has(name)) return;
      entries.set(name, {
        name,
        path: githubPath(record, prefix + name),
        size: 0,
        modified: synced,
        isDirectory: true,
      });
    };

    for (const path of this.#currentFiles(record)) {
      if (!path.startsWith(prefix)) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes("/")) {
        addFolder(rest.slice(0, rest.indexOf("/")));
        continue;
      }
      const change = record.changes[path];
      entries.set(rest, {
        name: rest,
        path: githubPath(record, path),
        size:
          typeof change?.content === "string"
            ? byteLength(change.content)
            : (record.files[path]?.size ?? 0),
        modified: change ? new Date(change.editedAt) : synced,
        isDirectory: false,
        gitStatus: change
          ? record.files[path]
            ? "modified"
            : "untracked"
          : "clean",
      });
    }
    for (const folder of record.folders) {
      if (folder.startsWith(prefix))
        addFolder(folder.slice(prefix.length).split("/")[0]);
    }
    return [...entries.values()];
  }

  async readFile(path: string): Promise<string> {
    const { record, repoPath } = await this.#locate(path);
    return this.#read(record, repoPath);
  }

  async writeFile(path: string, content: string): Promise<boolean> {
    const { record, repoPath } = await this.#locate(path);
    this.#checkEditable();
    if (!repoPath || this.#isFolder(record, repoPath)) {
      throw new Error(`Can't write a file over the folder ${repoPath || "/"}`);
    }
    if (byteLength(content) > MAX_FILE_BYTES) {
      throw new Error(
        `${repoPath} is too big to save here (${sizeText(byteLength(content))}).`,
      );
    }
    const opened = this.#openedVersions.get(path);
    if (
      opened !== undefined &&
      opened !== (record.files[repoPath]?.sha ?? null)
    ) {
      throw new StaleFileError(repoPath);
    }
    const existing =
      this.#isFile(record, repoPath) && !isProjectFile(repoPath)
        ? await this.#read(record, repoPath)
        : undefined;
    checkWrite(repoPath, existing);
    await this.#setContent(record, repoPath, content);
    await this.#save(record);
    return true;
  }

  /** Writes a project file (the browser's file system names this saveFile). */
  async saveFile(content: string, path: string) {
    await this.writeFile(path, content);
    return { success: true, filepath: path };
  }

  async deleteFile(path: string): Promise<boolean> {
    const { record, repoPath } = await this.#locate(path);
    this.#checkEditable();
    if (!repoPath) throw new Error("Can't delete the whole repository");
    if (this.#isFolder(record, repoPath)) {
      this.#checkFolderIsLocal(record, repoPath);
      const prefix = repoPath + "/";
      for (const file of this.#currentFiles(record)) {
        if (file.startsWith(prefix)) this.#remove(record, file);
      }
      record.folders = record.folders.filter(
        (f) => f !== repoPath && !f.startsWith(prefix),
      );
    } else if (this.#isFile(record, repoPath)) {
      checkRemove(repoPath);
      this.#remove(record, repoPath);
    } else {
      throw new Error(`File not found: ${repoPath}`);
    }
    await this.#save(record);
    return true;
  }

  async fileExists(path: string): Promise<boolean> {
    const { record, repoPath } = await this.#locate(path);
    return this.#isFile(record, repoPath) || this.#isFolder(record, repoPath);
  }

  async createDirectory(dir: string): Promise<boolean> {
    const { record, repoPath } = await this.#locate(dir);
    this.#checkEditable();
    if (this.#isFile(record, repoPath)) {
      throw new Error(`A file named ${repoPath} already exists`);
    }
    if (!this.#isFolder(record, repoPath)) {
      record.folders.push(repoPath);
      await this.#save(record);
    }
    return true;
  }

  async renameFile(from: string, to: string) {
    const source = await this.#locate(from);
    const target = await this.#locate(to);
    if (source.record !== target.record) {
      throw new Error("Files can't be moved between repositories.");
    }
    this.#checkEditable();
    const record = source.record;
    const [src, dest] = [source.repoPath, target.repoPath];
    if (src === dest) return { success: true, newPath: to };
    if (this.#isFile(record, dest) || this.#isFolder(record, dest)) {
      throw new Error(`${dest} already exists`);
    }

    const isFolder = this.#isFolder(record, src);
    if (isFolder) {
      this.#checkFolderIsLocal(record, src);
    } else {
      checkRemove(src);
      checkRemove(dest);
    }
    const moves: [string, string][] = isFolder
      ? [...this.#currentFiles(record)]
          .filter((p) => p.startsWith(src + "/"))
          .map((p) => [p, dest + p.slice(src.length)])
      : [[src, dest]];
    for (const [oldPath, newPath] of moves) {
      await this.#setContent(
        record,
        newPath,
        await this.#read(record, oldPath),
      );
      this.#remove(record, oldPath);
      // An open project keeps its version check under its new name.
      const opened = this.#openedVersions.get(githubPath(record, oldPath));
      if (opened !== undefined) {
        this.#openedVersions.delete(githubPath(record, oldPath));
        this.#openedVersions.set(
          githubPath(record, newPath),
          record.files[newPath]?.sha ?? null,
        );
      }
    }
    record.folders = record.folders.map((f) =>
      f === src || f.startsWith(src + "/") ? dest + f.slice(src.length) : f,
    );
    await this.#save(record);
    return { success: true, newPath: to };
  }

  async copyFile(from: string, to: string): Promise<boolean> {
    return this.writeFile(to, await this.readFile(from));
  }

  async getDirectoryStats(dir: string) {
    const { record, repoPath } = await this.#locate(dir);
    const prefix = repoPath ? repoPath + "/" : "";
    let files = 0;
    let size = 0;
    for (const path of this.#currentFiles(record)) {
      if (!path.startsWith(prefix)) continue;
      files++;
      const change = record.changes[path];
      size +=
        typeof change?.content === "string"
          ? byteLength(change.content)
          : (record.files[path]?.size ?? 0);
    }
    return { size, files };
  }

  // --- Git ---

  /** The file as it is on GitHub (at the commit the working copy is based on). */
  async gitShow(path: string): Promise<string | null> {
    const { record, repoPath } = await this.#locate(path);
    const file = record.files[repoPath];
    return file ? this.#download(record, repoPath, file.sha) : null;
  }

  /** Edited files in the repository, by app path, like `git status`. */
  async gitStatus(dir: string): Promise<Record<string, string>> {
    const { record } = await this.#locate(dir);
    const statuses: Record<string, string> = {};
    for (const [path, change] of Object.entries(record.changes)) {
      if (change.content === null) continue;
      statuses[githubPath(record, path)] = record.files[path]
        ? "modified"
        : "untracked";
    }
    return statuses;
  }

  async changes(ref: RepoRef): Promise<RepoChange[]> {
    const record = await this.#record(ref);
    return Object.entries(record.changes)
      .map(([repoPath, change]): RepoChange => {
        let status: ChangeStatus = "added";
        if (change.content === null) status = "deleted";
        else if (record.files[repoPath]) status = "modified";
        return { path: githubPath(record, repoPath), repoPath, status };
      })
      .sort((a, b) => a.repoPath.localeCompare(b.repoPath));
  }

  /** Throws away edits: all of them, or just the files at these app paths. */
  async discard(ref: RepoRef, paths?: string[]): Promise<void> {
    const record = await this.#record(ref);
    this.#checkEditable();
    if (paths) {
      for (const path of paths) {
        const parsed = parseGitHubPath(path);
        if (parsed) delete record.changes[parsed.repoPath];
      }
    } else {
      record.changes = {};
      record.folders = [];
    }
    await this.#save(record);
  }

  /** The edited files' new contents, to copy somewhere else. */
  async changedFiles(
    ref: RepoRef,
  ): Promise<{ repoPath: string; content: string }[]> {
    const record = await this.#record(ref);
    return Object.entries(record.changes).flatMap(([repoPath, change]) =>
      change.content === null ? [] : [{ repoPath, content: change.content }],
    );
  }

  /**
   * Commits every edit in one commit: to the branch, or with `newBranch` to a
   * new branch started from it, ready for a pull request.
   */
  async commit(
    ref: RepoRef,
    message: string,
    { newBranch }: { newBranch?: string } = {},
  ): Promise<CommitResult> {
    const record = await this.#record(ref);
    this.#checkEditable();
    const sent = { ...record.changes };
    const additions: Record<string, string> = {};
    const deletions: string[] = [];
    for (const [path, change] of Object.entries(sent)) {
      if (change.content !== null) additions[path] = change.content;
      else if (record.files[path]) deletions.push(path);
    }
    if (Object.keys(additions).length === 0 && deletions.length === 0) {
      throw new Error("There's nothing to commit.");
    }

    const baseBranch = record.branch;
    const branch = newBranch?.trim() || baseBranch;
    if (branch !== baseBranch) {
      await this.#client.createBranch(
        record.owner,
        record.repo,
        branch,
        record.headSha,
      );
    }
    const result = await this.#client.commit({
      owner: record.owner,
      repo: record.repo,
      branch,
      expectedHeadSha: record.headSha,
      message,
      additions,
      deletions,
    });

    // The branch now holds exactly these edits on top of what we had.
    for (const [path, content] of Object.entries(additions)) {
      const sha = await gitBlobSha(content);
      record.files[path] = { sha, size: byteLength(content) };
      this.#cacheBlob(sha, content);
      // The editor shows what was just committed.
      const appPath = githubPath(record, path);
      if (this.#openedVersions.has(appPath)) {
        this.#openedVersions.set(appPath, sha);
      }
    }
    for (const path of deletions) delete record.files[path];
    for (const [path, change] of Object.entries(sent)) {
      // Leave anything edited again while the commit was being sent.
      if (record.changes[path] === change) delete record.changes[path];
    }
    record.branch = branch;
    record.headSha = result.sha;
    record.syncedAt = now();
    await this.#save(record);
    return {
      ...result,
      branch,
      pullRequestUrl:
        branch === baseBranch
          ? undefined
          : `https://github.com/${record.owner}/${record.repo}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(branch)}?expand=1`,
    };
  }

  /**
   * Brings the working copy up to date with the branch on GitHub, keeping
   * edits made here. If a file was edited both here and on GitHub, nothing
   * changes until `resolve` says what to do with it.
   */
  async update(ref: RepoRef, resolve?: Resolution): Promise<UpdateResult> {
    const record = await this.#record(ref);
    return this.#moveTo(record, record.branch, resolve);
  }

  /**
   * Moves the working copy, edits and all, onto another branch: for when
   * the branch was deleted, or the edits belong somewhere else.
   */
  async switchBranch(
    ref: RepoRef,
    branch: string,
    resolve?: Resolution,
  ): Promise<UpdateResult> {
    const record = await this.#record(ref);
    return this.#moveTo(record, branch, resolve);
  }

  async listBranches(ref: RepoRef): Promise<string[]> {
    return this.#client.listBranches(ref.owner, ref.repo);
  }

  async #moveTo(
    record: RepoRecord,
    branch: string,
    resolve?: Resolution,
  ): Promise<UpdateResult> {
    this.#checkEditable();
    const headSha = await this.#client
      .getBranchHead(record.owner, record.repo, branch)
      .catch((e) => {
        if (e instanceof GitHubError && e.kind === "not-found") {
          throw new GitHubError(
            `The branch ${branch} isn't on GitHub any more. Use Switch branch to take your changes to another branch, or save copies of them on this device.`,
            "not-found",
          );
        }
        throw e;
      });
    if (headSha === record.headSha && branch === record.branch) {
      return { status: "up-to-date" };
    }

    const { files, truncated } = await this.#client.getFiles(
      record.owner,
      record.repo,
      headSha,
    );
    if (truncated) {
      throw new Error(`${repoKey(record)} has too many files to open here.`);
    }
    const next: RepoRecord["files"] = Object.fromEntries(
      files.map((f) => [f.path, { sha: f.sha, size: f.size }]),
    );

    const sameAsGitHub: string[] = [];
    const conflicts: string[] = [];
    for (const [path, change] of Object.entries(record.changes)) {
      const before = record.files[path]?.sha;
      const after = next[path]?.sha;
      if (before === after) continue;
      const mine =
        change.content === null ? undefined : await gitBlobSha(change.content);
      if (mine === after) sameAsGitHub.push(path);
      else conflicts.push(path);
    }
    if (conflicts.length > 0 && !resolve) {
      return {
        status: "conflicts",
        conflicts: conflicts.map((p) => githubPath(record, p)),
      };
    }

    for (const path of sameAsGitHub) delete record.changes[path];
    const copies: string[] = [];
    if (resolve === "theirs" || resolve === "both") {
      for (const path of conflicts) {
        const change = record.changes[path];
        delete record.changes[path];
        // Generated code is made again on the next save, so only projects
        // are worth a copy.
        if (resolve === "both" && change?.content && isProjectFile(path)) {
          const copy = copyName(path, (p) => !!next[p] || !!record.changes[p]);
          record.changes[copy] = { content: change.content, editedAt: now() };
          copies.push(githubPath(record, copy));
        }
      }
    }
    const changedOnGitHub = [
      ...new Set([...Object.keys(record.files), ...Object.keys(next)]),
    ].filter(
      (path) =>
        record.files[path]?.sha !== next[path]?.sha && !record.changes[path],
    );
    // Projects kept as "mine" stay open as they are; saving them again
    // shouldn't count as replacing what GitHub has now.
    if (resolve === "mine") {
      for (const path of conflicts) {
        const appPath = githubPath(record, path);
        if (this.#openedVersions.has(appPath)) {
          this.#openedVersions.set(appPath, next[path]?.sha ?? null);
        }
      }
    }

    const old = { ...record, files: record.files };
    record.files = next;
    record.branch = branch;
    record.headSha = headSha;
    record.syncedAt = now();
    this.#forgetUnusedBlobs(old);
    await this.#save(record);
    return {
      status: "updated",
      changedOnGitHub: changedOnGitHub.map((p) => githubPath(record, p)),
      copies,
    };
  }

  // --- Internals ---

  async #record(ref: RepoRef): Promise<RepoRecord> {
    const record = await this.get(ref);
    if (!record) throw new Error(`${repoKey(ref)} isn't open.`);
    return record;
  }

  async #locate(path: string) {
    const parsed = parseGitHubPath(path);
    if (!parsed) throw new Error(`Not a GitHub path: ${path}`);
    const record = await this.get(parsed);
    if (!record) {
      throw new Error(
        `${repoKey(parsed)} isn't open in Turtle Tracer. Open it from GitHub again.`,
      );
    }
    return { record, repoPath: parsed.repoPath };
  }

  /** Throws unless the folder only holds files added here (none from GitHub). */
  #checkFolderIsLocal(record: RepoRecord, repoPath: string) {
    const prefix = repoPath + "/";
    if (Object.keys(record.files).some((p) => p.startsWith(prefix))) {
      throw new RepoRuleError(FOLDER_RULE);
    }
  }

  /** Paths of the files in the working copy, edits included. */
  #currentFiles(record: RepoRecord): Set<string> {
    const files = new Set(Object.keys(record.files));
    for (const [path, change] of Object.entries(record.changes)) {
      if (change.content === null) files.delete(path);
      else files.add(path);
    }
    return files;
  }

  #isFile(record: RepoRecord, repoPath: string) {
    const change = record.changes[repoPath];
    return change ? change.content !== null : !!record.files[repoPath];
  }

  #isFolder(record: RepoRecord, repoPath: string) {
    if (!repoPath || record.folders.includes(repoPath)) return true;
    const prefix = repoPath + "/";
    for (const path of this.#currentFiles(record)) {
      if (path.startsWith(prefix)) return true;
    }
    return false;
  }

  async #read(record: RepoRecord, repoPath: string): Promise<string> {
    const change = record.changes[repoPath];
    if (change) {
      if (change.content === null)
        throw new Error(`File not found: ${repoPath}`);
      return change.content;
    }
    const file = record.files[repoPath];
    if (!file) throw new Error(`File not found: ${repoPath}`);
    return this.#download(record, repoPath, file.sha);
  }

  /**
   * Sets a file's contents. Matching GitHub's version again undoes the edit,
   * and so does a project that only differs in which app version saved it,
   * so teammates on different versions don't commit changes back and forth.
   */
  async #setContent(record: RepoRecord, repoPath: string, content: string) {
    const original = record.files[repoPath];
    let unchanged = original?.sha === (await gitBlobSha(content));
    if (!unchanged && original && isProjectFile(repoPath)) {
      const githubVersion = await this.#download(
        record,
        repoPath,
        original.sha,
      ).catch(() => null);
      const ours = projectWithoutVersion(content);
      unchanged =
        ours !== null &&
        githubVersion !== null &&
        ours === projectWithoutVersion(githubVersion);
    }
    if (unchanged) {
      delete record.changes[repoPath];
    } else {
      record.changes[repoPath] = { content, editedAt: now() };
    }
    // The file now holds the folders it is in.
    record.folders = record.folders.filter(
      (f) => !repoPath.startsWith(f + "/"),
    );
  }

  #remove(record: RepoRecord, repoPath: string) {
    if (record.files[repoPath]) {
      record.changes[repoPath] = { content: null, editedAt: now() };
    } else {
      delete record.changes[repoPath];
    }
  }

  async #download(
    record: RepoRecord,
    repoPath: string,
    sha: string,
  ): Promise<string> {
    const cached = this.#blobs.get(sha);
    if (cached !== undefined) return cached;
    const size = record.files[repoPath]?.size ?? 0;
    if (size > MAX_FILE_BYTES) {
      throw new Error(
        `${repoPath} is too big to open here (${sizeText(size)}).`,
      );
    }

    let download = this.#downloads.get(sha);
    if (!download) {
      download = (async () => {
        const stored = await this.#storage.getBlob(sha).catch(() => undefined);
        if (stored !== undefined) return stored;
        const content = await this.#client.readFile(
          record.owner,
          record.repo,
          record.headSha,
          repoPath,
        );
        void this.#storage
          .putBlob(sha, content)
          .catch((e) => console.warn("Couldn't keep a downloaded file:", e));
        return content;
      })().finally(() => this.#downloads.delete(sha));
      this.#downloads.set(sha, download);
    }
    const content = await download;
    this.#blobs.set(sha, content);
    return content;
  }

  #cacheBlob(sha: string, content: string) {
    this.#blobs.set(sha, content);
    void this.#storage
      .putBlob(sha, content)
      .catch((e) => console.warn("Couldn't keep a committed file:", e));
  }

  /** Drops stored contents that no open repository's files use any more. */
  #forgetUnusedBlobs(old: RepoRecord) {
    const inUse = new Set<string>();
    for (const record of this.#records.values()) {
      for (const file of Object.values(record.files)) inUse.add(file.sha);
    }
    const unused = Object.values(old.files)
      .map((f) => f.sha)
      .filter((sha) => !inUse.has(sha));
    for (const sha of unused) this.#blobs.delete(sha);
    void this.#storage
      .deleteBlobs(unused)
      .catch((e) => console.warn("Couldn't clear old downloads:", e));
  }

  /**
   * Saves a record, one save at a time per repository. If the browser won't
   * store it (full, or blocked in a private window), the caller is told, so
   * an edit never looks kept when it isn't.
   */
  #save(record: RepoRecord): Promise<void> {
    const key = repoKey(record);
    const attempt = (this.#saving.get(key) ?? Promise.resolve()).then(() =>
      this.#storage.saveRepo(record),
    );
    this.#saving.set(
      key,
      attempt.catch(() => undefined),
    );
    this.#publish();
    return attempt.then(
      () => this.#channel?.postMessage(key),
      (e) => {
        console.error(`Couldn't save ${key}:`, e);
        throw new Error(
          `Couldn't keep your changes on this device (${e instanceof Error ? e.message : e}). Commit them now so they aren't lost.`,
        );
      },
    );
  }

  #publish() {
    this.summaries.set(
      [...this.#records.values()].map((r) => ({
        owner: r.owner,
        repo: r.repo,
        branch: r.branch,
        changeCount: Object.keys(r.changes).length,
      })),
    );
  }
}

/** The deepest folder holding all these files ("" for the top folder). */
function commonFolder(paths: string[]): string | null {
  if (paths.length === 0) return null;
  let common = parentOf(paths[0]).split("/");
  for (const path of paths.slice(1)) {
    const parts = parentOf(path).split("/");
    let i = 0;
    while (i < common.length && common[i] === parts[i]) i++;
    common = common.slice(0, i);
  }
  return common.join("/");
}

/** Tabs only need to hear about each other in a real browser. */
function tabChannel(): BroadcastChannel | null {
  if (!globalThis.navigator?.locks || typeof BroadcastChannel === "undefined") {
    return null;
  }
  return new BroadcastChannel("turtle-tracer-github");
}

export const githubRepos = new GitHubRepos(
  createGitHubClient(getGitHubToken, desktopFetch()),
  indexedDbRepoStorage(),
  browserEditingLock(),
  tabChannel(),
);

const SOURCE_KEY = "turtle-tracer-file-source";

function readSource(): string | null {
  try {
    return localStorage.getItem(SOURCE_KEY);
  } catch {
    return null;
  }
}

/** The repository ("owner/repo") the file manager is showing, or null for this device's files. */
export const browsingRepo = writable<string | null>(readSource());
browsingRepo.subscribe((key) => {
  try {
    if (key) localStorage.setItem(SOURCE_KEY, key);
    else localStorage.removeItem(SOURCE_KEY);
  } catch {
    // Not remembered; the file manager starts on this device's files.
  }
});
