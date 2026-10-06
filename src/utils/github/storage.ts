// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Keeps opened repositories, their edits and downloaded files in IndexedDB,
// so they survive reloads and can be edited offline.

/** A repository opened in the app, and the edits not yet committed. */
export interface RepoRecord {
  owner: string;
  repo: string;
  branch: string;
  /** The commit the working copy is based on. */
  headSha: string;
  /** When the working copy was last brought up to date with GitHub. */
  syncedAt: string;
  /** Every file at headSha: path in the repository to git's id for its contents. */
  files: Record<string, { sha: string; size: number }>;
  /** Uncommitted edits: new contents, or null for a deleted file. */
  changes: Record<string, { content: string | null; editedAt: string }>;
  /** Folders made here that don't hold a file yet (git only stores files). */
  folders: string[];
  /** The folder last browsed, to come back to. */
  lastFolder?: string;
}

export interface RepoStorage {
  loadRepos(): Promise<RepoRecord[]>;
  saveRepo(record: RepoRecord): Promise<void>;
  deleteRepo(key: string): Promise<void>;
  /** File contents downloaded from GitHub, by git's id for them. */
  getBlob(sha: string): Promise<string | undefined>;
  putBlob(sha: string, content: string): Promise<void>;
  deleteBlobs(shas: string[]): Promise<void>;
}

const DB_NAME = "TurtleTracerGitHub";
const REPOS = "repos";
const BLOBS = "blobs";

const keyOf = (r: { owner: string; repo: string }) => `${r.owner}/${r.repo}`;

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(new Error(req.error?.message));
  });
}

export function indexedDbRepoStorage(): RepoStorage {
  let db: Promise<IDBDatabase> | null = null;
  const open = () =>
    (db ??= new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(REPOS);
        req.result.createObjectStore(BLOBS);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(new Error(req.error?.message));
    }));

  async function store(name: string, mode: IDBTransactionMode) {
    return (await open()).transaction(name, mode).objectStore(name);
  }

  return {
    async loadRepos() {
      return request((await store(REPOS, "readonly")).getAll());
    },
    async saveRepo(record) {
      // Stored as a plain copy: Svelte state proxies can't be cloned.
      await request(
        (await store(REPOS, "readwrite")).put(
          structuredClone(record),
          keyOf(record),
        ),
      );
    },
    async deleteRepo(key) {
      await request((await store(REPOS, "readwrite")).delete(key));
    },
    async getBlob(sha) {
      return request((await store(BLOBS, "readonly")).get(sha));
    },
    async putBlob(sha, content) {
      await request((await store(BLOBS, "readwrite")).put(content, sha));
    },
    async deleteBlobs(shas) {
      const blobs = await store(BLOBS, "readwrite");
      await Promise.all(shas.map((sha) => request(blobs.delete(sha))));
    },
  };
}

/** Storage that only lasts as long as the page, for tests. */
export function memoryRepoStorage(): RepoStorage {
  const repos = new Map<string, RepoRecord>();
  const blobs = new Map<string, string>();
  return {
    loadRepos: async () => [...repos.values()].map((r) => structuredClone(r)),
    saveRepo: async (r) => void repos.set(keyOf(r), structuredClone(r)),
    deleteRepo: async (key) => void repos.delete(key),
    getBlob: async (sha) => blobs.get(sha),
    putBlob: async (sha, content) => void blobs.set(sha, content),
    deleteBlobs: async (shas) => shas.forEach((sha) => blobs.delete(sha)),
  };
}
