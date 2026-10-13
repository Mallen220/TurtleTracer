// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The few GitHub calls the app makes. Reading public repositories works
// without a token; committing needs one.

export type GitHubErrorKind =
  | "rate-limit"
  | "unauthorized"
  | "forbidden"
  /** The branch only takes changes through pull requests. */
  | "protected"
  | "not-found"
  | "stale"
  | "network"
  | "other";

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly kind: GitHubErrorKind,
    /** When the rate limit resets, for "rate-limit" errors. */
    readonly resetAt?: Date,
  ) {
    super(message);
    this.name = "GitHubError";
  }
}

export interface RepoInfo {
  /** Owner and name as GitHub spells them. */
  owner: string;
  repo: string;
  defaultBranch: string;
  isPrivate: boolean;
}

/** A file in a commit. */
export interface TreeFile {
  path: string;
  /** Git's id for the file's contents. */
  sha: string;
  size: number;
}

export interface CommitRequest {
  owner: string;
  repo: string;
  branch: string;
  /** The commit the changes were made on; the commit fails if the branch has moved since. */
  expectedHeadSha: string;
  message: string;
  /** Files to add or replace, path to text. */
  additions: Record<string, string>;
  deletions: string[];
}

export interface GitHubClient {
  getRepo(owner: string, repo: string): Promise<RepoInfo>;
  listBranches(owner: string, repo: string): Promise<string[]>;
  /** The commit a branch points at. */
  getBranchHead(owner: string, repo: string, branch: string): Promise<string>;
  /** Every file in a commit. */
  getFiles(
    owner: string,
    repo: string,
    commitSha: string,
  ): Promise<{ files: TreeFile[]; truncated: boolean }>;
  readFile(
    owner: string,
    repo: string,
    commitSha: string,
    path: string,
  ): Promise<string>;
  /** The login of the token's user. */
  getViewer(): Promise<string>;
  /** Whether the token's user may push to the repository. */
  canPush(owner: string, repo: string): Promise<boolean>;
  /** Starts a branch at a commit. Fine if it already starts there. */
  createBranch(
    owner: string,
    repo: string,
    branch: string,
    fromSha: string,
  ): Promise<void>;
  commit(request: CommitRequest): Promise<{ sha: string; url: string }>;
}

/** How long to wait for GitHub before giving up, in milliseconds. */
const TIMEOUT_MS = 20_000;
const COMMIT_TIMEOUT_MS = 60_000;

/** Git's rules for branch names, roughly: what GitHub will accept. */
export function branchNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Enter a name for the new branch.";
  if (
    /[\s~^:?*[\\]|\.\.|@\{|\/\/|^[/.-]|[/.]$|\.lock$/.test(trimmed) ||
    trimmed === "@"
  ) {
    return String.raw`Branch names can't have spaces, "..", or any of ~ ^ : ? * [ \, and can't start or end with "/" or ".".`;
  }
  return null;
}

/** A GitHub response passed back from the desktop app's main process. */
interface BridgedResponse {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
  /** Set when the request couldn't be made at all. */
  error?: string;
}

/**
 * In the desktop app, GitHub requests go through the main process, which
 * adds the token, so the page never holds it. Undefined elsewhere.
 */
export function desktopFetch(): typeof fetch | undefined {
  const bridge = (
    globalThis as {
      electronAPI?: {
        githubFetch?: (
          url: string,
          init: {
            method: string;
            headers: Record<string, string>;
            body?: string;
          },
        ) => Promise<BridgedResponse>;
      };
    }
  ).electronAPI?.githubFetch;
  if (typeof bridge !== "function") return undefined;

  return async (input, init = {}) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const res = await bridge(urlOf(input), {
      method: init.method ?? "GET",
      headers,
      body: typeof init.body === "string" ? init.body : undefined,
    });
    if (res.error || !res.status) {
      const error = new TypeError(res.error ?? "Request failed");
      if (res.error === "timeout") error.name = "TimeoutError";
      throw error;
    }
    const empty = res.status === 204 || res.status === 304;
    return new Response(empty ? null : (res.body ?? ""), {
      status: res.status,
      headers: res.headers,
    });
  };
}

/** The URL a fetch() call asks for. */
function urlOf(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

const API = "https://api.github.com";
const RAW = "https://raw.githubusercontent.com";

const encodePath = (path: string) =>
  path.split("/").map(encodeURIComponent).join("/");

/** UTF-8 text as base64, as GitHub's commit API wants file contents. */
export function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCodePoint(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

async function errorFrom(res: Response, what: string): Promise<GitHubError> {
  let detail = "";
  try {
    detail = ((await res.json()) as { message?: string }).message ?? "";
  } catch {
    // Not JSON; the status says enough.
  }

  const remaining = res.headers.get("x-ratelimit-remaining");
  if ((res.status === 403 || res.status === 429) && remaining === "0") {
    const reset = Number(res.headers.get("x-ratelimit-reset"));
    const resetAt = reset ? new Date(reset * 1000) : undefined;
    const when = resetAt
      ? ` until ${resetAt.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`
      : "";
    return new GitHubError(
      `GitHub's limit for use without a token is used up on this network${when}. Add a token to keep going.`,
      "rate-limit",
      resetAt,
    );
  }
  if (res.status === 401) {
    return new GitHubError(
      "GitHub didn't accept your token. It may have expired or been deleted; add a new one.",
      "unauthorized",
    );
  }
  if (res.status === 404) {
    return new GitHubError(`Couldn't find ${what} on GitHub.`, "not-found");
  }
  const said = detail ? `: ${detail}` : "";
  if (res.status === 403) {
    return new GitHubError(
      `GitHub refused access to ${what}${said || "."}`,
      "forbidden",
    );
  }
  return new GitHubError(
    `GitHub couldn't load ${what} (${res.status}${said}).`,
    "other",
  );
}

export function createGitHubClient(
  getToken: () => string | null,
  fetchImpl: typeof fetch = (...args) => globalThis.fetch(...args),
): GitHubClient {
  async function send(
    url: string,
    what: string,
    init: RequestInit = {},
    timeoutMs = TIMEOUT_MS,
  ) {
    let res: Response;
    try {
      res = await fetchImpl(url, {
        ...init,
        signal: AbortSignal.timeout?.(timeoutMs),
      });
    } catch (e) {
      // Browsers report timeouts as a DOMException, which isn't always an Error.
      const name = (e as { name?: unknown } | null)?.name;
      const timedOut = name === "TimeoutError" || name === "AbortError";
      throw new GitHubError(
        timedOut
          ? "GitHub didn't answer in time. Check your connection and try again."
          : "Couldn't reach GitHub. Check your internet connection. Some school networks block GitHub.",
        "network",
      );
    }
    if (!res.ok) throw await errorFrom(res, what);
    return res;
  }

  function apiHeaders(): Record<string, string> {
    const token = getToken();
    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }

  const getJson = async <T>(path: string, what: string): Promise<T> =>
    (await send(`${API}${path}`, what, { headers: apiHeaders() })).json();

  return {
    async getRepo(owner, repo) {
      const data = await getJson<{
        name: string;
        owner: { login: string };
        default_branch: string;
        private: boolean;
      }>(`/repos/${owner}/${repo}`, `${owner}/${repo}`).catch((e) => {
        if (e instanceof GitHubError && e.kind === "not-found") {
          throw new GitHubError(
            `Couldn't find ${owner}/${repo} on GitHub. Check the link. Private repositories aren't supported yet.`,
            "not-found",
          );
        }
        throw e;
      });
      return {
        owner: data.owner.login,
        repo: data.name,
        defaultBranch: data.default_branch,
        isPrivate: data.private,
      };
    },

    async listBranches(owner, repo) {
      const data = await getJson<{ name: string }[]>(
        `/repos/${owner}/${repo}/branches?per_page=100`,
        `the branches of ${owner}/${repo}`,
      );
      return data.map((b) => b.name);
    },

    async getBranchHead(owner, repo, branch) {
      const data = await getJson<{ object: { sha: string } }>(
        `/repos/${owner}/${repo}/git/ref/heads/${encodePath(branch)}`,
        `branch ${branch} of ${owner}/${repo}`,
      );
      return data.object.sha;
    },

    async getFiles(owner, repo, commitSha) {
      const data = await getJson<{
        tree: { path: string; type: string; sha: string; size?: number }[];
        truncated: boolean;
      }>(
        `/repos/${owner}/${repo}/git/trees/${commitSha}?recursive=1`,
        `the files of ${owner}/${repo}`,
      );
      return {
        files: data.tree
          .filter((entry) => entry.type === "blob")
          .map(({ path, sha, size }) => ({ path, sha, size: size ?? 0 })),
        truncated: data.truncated,
      };
    },

    async readFile(owner, repo, commitSha, path) {
      // raw.githubusercontent.com doesn't count towards the API rate limit.
      const res = await send(
        `${RAW}/${owner}/${repo}/${commitSha}/${encodePath(path)}`,
        path,
      );
      return res.text();
    },

    async getViewer() {
      if (!getToken()) {
        throw new GitHubError("No token has been added.", "unauthorized");
      }
      const data = await getJson<{ login: string }>("/user", "your account");
      return data.login;
    },

    async canPush(owner, repo) {
      const data = await getJson<{ permissions?: { push?: boolean } }>(
        `/repos/${owner}/${repo}`,
        `${owner}/${repo}`,
      );
      return data.permissions?.push === true;
    },

    async createBranch(owner, repo, branch, fromSha) {
      const res = await fetchImpl(`${API}/repos/${owner}/${repo}/git/refs`, {
        method: "POST",
        headers: { ...apiHeaders(), "Content-Type": "application/json" },
        body: JSON.stringify({ ref: `refs/heads/${branch}`, sha: fromSha }),
        signal: AbortSignal.timeout?.(TIMEOUT_MS),
      }).catch(() => {
        throw new GitHubError(
          "Couldn't reach GitHub. Check your internet connection.",
          "network",
        );
      });
      if (res.ok) return;
      if (res.status === 422) {
        // Already there: fine if it starts where we would have started it.
        const existing = await this.getBranchHead(owner, repo, branch).catch(
          () => null,
        );
        if (existing === fromSha) return;
        throw new GitHubError(
          `A branch named ${branch} already exists. Pick another name.`,
          "other",
        );
      }
      throw await errorFrom(res, `branch ${branch}`);
    },

    async commit(request) {
      if (!getToken()) {
        throw new GitHubError("Add a GitHub token to commit.", "unauthorized");
      }
      const [headline, ...body] = request.message.trim().split("\n");
      const res = await send(
        `${API}/graphql`,
        "the commit",
        {
          method: "POST",
          headers: { ...apiHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            query: `mutation ($input: CreateCommitOnBranchInput!) {
            createCommitOnBranch(input: $input) { commit { oid url } }
          }`,
            variables: {
              input: {
                branch: {
                  repositoryNameWithOwner: `${request.owner}/${request.repo}`,
                  branchName: request.branch,
                },
                message: {
                  headline,
                  ...(body.join("\n").trim()
                    ? { body: body.join("\n").trim() }
                    : {}),
                },
                expectedHeadOid: request.expectedHeadSha,
                fileChanges: {
                  additions: Object.entries(request.additions).map(
                    ([path, text]) => ({ path, contents: toBase64(text) }),
                  ),
                  deletions: request.deletions.map((path) => ({ path })),
                },
              },
            },
          }),
        },
        COMMIT_TIMEOUT_MS,
      );

      const result = (await res.json()) as {
        data?: {
          createCommitOnBranch?: { commit: { oid: string; url: string } };
        };
        errors?: { type?: string; message: string }[];
      };
      const commit = result.data?.createCommitOnBranch?.commit;
      if (commit) return { sha: commit.oid, url: commit.url };
      throw commitError(result.errors ?? [], request.branch);
    },
  };
}

function commitError(
  errors: { type?: string; message: string }[],
  branch: string,
): GitHubError {
  const message = errors.map((e) => e.message).join(" ");
  if (
    errors.some((e) => e.type === "STALE_DATA") ||
    /expected branch to point to/i.test(message)
  ) {
    return new GitHubError(
      `Someone else committed to ${branch} since you last updated. Update from GitHub, then commit again.`,
      "stale",
    );
  }
  if (/protected branch|pull request|rule violation|ruleset/i.test(message)) {
    return new GitHubError(
      `${branch} only takes changes through pull requests. Commit to a new branch instead, then open a pull request.`,
      "protected",
    );
  }
  if (
    errors.some((e) => e.type === "FORBIDDEN") ||
    /not accessible|permission|denied/i.test(message)
  ) {
    return new GitHubError(
      `Your token can't commit to this repository. Check the token: its Resource owner must be the repository's owner, the repository must be selected under Repository access, and Contents must be "Read and write". If your organization approves tokens, an owner has to approve it first. (GitHub said: ${message})`,
      "forbidden",
    );
  }
  const said = message ? `: ${message}` : ".";
  return new GitHubError(`GitHub didn't accept the commit${said}`, "other");
}
