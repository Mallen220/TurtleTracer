// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// An in-memory GitHub for tests: repositories with branches of commits.
import {
  GitHubError,
  type CommitRequest,
  type GitHubClient,
} from "../../utils/github/api";
import { gitBlobSha } from "../../utils/github/repos";

type Files = Record<string, string>;

/** GitHub's answer to a request: `work`'s result, or its error, a moment later. */
const answer = <T>(work: () => T): Promise<T> => Promise.resolve().then(work);

interface FakeRepo {
  owner: string;
  repo: string;
  defaultBranch: string;
  isPrivate: boolean;
  /** Branch name to commit id. */
  branches: Record<string, string>;
}

export class FakeGitHub implements GitHubClient {
  repos = new Map<string, FakeRepo>();
  commits = new Map<string, Files>();
  commitRequests: CommitRequest[] = [];
  /** Calls by method name, to check how much is downloaded. */
  calls: Record<string, number> = {};
  token: string | null = "token";
  viewer = "student";
  /** Whether the viewer may push. */
  pushAllowed = true;
  /** Branches that only take changes through pull requests. */
  protectedBranches = new Set<string>();
  #nextId = 1;

  addRepo(
    owner: string,
    repo: string,
    files: Files,
    { branch = "main", isPrivate = false } = {},
  ) {
    const sha = this.#commitFiles(files);
    this.repos.set(`${owner}/${repo}`.toLowerCase(), {
      owner,
      repo,
      defaultBranch: branch,
      isPrivate,
      branches: { [branch]: sha },
    });
    return sha;
  }

  /** Someone else pushes to a branch. */
  push(owner: string, repo: string, branch: string, edits: Partial<Files>) {
    const r = this.#repo(owner, repo);
    const files = { ...this.commits.get(r.branches[branch])! };
    for (const [path, content] of Object.entries(edits)) {
      if (content === undefined) delete files[path];
      else files[path] = content;
    }
    r.branches[branch] = this.#commitFiles(files);
  }

  deleteBranch(owner: string, repo: string, branch: string) {
    delete this.#repo(owner, repo).branches[branch];
  }

  addBranch(owner: string, repo: string, branch: string, from = "main") {
    const r = this.#repo(owner, repo);
    r.branches[branch] = r.branches[from];
  }

  filesOn(owner: string, repo: string, branch = "main"): Files {
    const r = this.#repo(owner, repo);
    return this.commits.get(r.branches[branch])!;
  }

  #commitFiles(files: Files) {
    const sha = `commit${this.#nextId++}`;
    this.commits.set(sha, { ...files });
    return sha;
  }

  #count(name: string) {
    this.calls[name] = (this.calls[name] ?? 0) + 1;
  }

  #repo(owner: string, repo: string) {
    const r = this.repos.get(`${owner}/${repo}`.toLowerCase());
    if (!r)
      throw new GitHubError(`Couldn't find ${owner}/${repo}`, "not-found");
    return r;
  }

  getRepo(owner: string, repo: string) {
    this.#count("getRepo");
    return answer(() => {
      const r = this.#repo(owner, repo);
      return {
        owner: r.owner,
        repo: r.repo,
        defaultBranch: r.defaultBranch,
        isPrivate: r.isPrivate,
      };
    });
  }

  listBranches(owner: string, repo: string) {
    this.#count("listBranches");
    return answer(() => Object.keys(this.#repo(owner, repo).branches));
  }

  getBranchHead(owner: string, repo: string, branch: string) {
    this.#count("getBranchHead");
    return answer(() => {
      const sha = this.#repo(owner, repo).branches[branch];
      if (!sha) throw new GitHubError(`No branch ${branch}`, "not-found");
      return sha;
    });
  }

  async getFiles(_owner: string, _repo: string, commitSha: string) {
    this.#count("getFiles");
    const files = this.commits.get(commitSha)!;
    return {
      files: await Promise.all(
        Object.entries(files).map(async ([path, content]) => ({
          path,
          sha: await gitBlobSha(content),
          size: new TextEncoder().encode(content).length,
        })),
      ),
      truncated: false,
    };
  }

  readFile(_owner: string, _repo: string, commitSha: string, path: string) {
    this.#count("readFile");
    return answer(() => {
      const content = this.commits.get(commitSha)?.[path];
      if (content === undefined) {
        throw new GitHubError(`Couldn't find ${path}`, "not-found");
      }
      return content;
    });
  }

  getViewer() {
    return answer(() => {
      if (!this.token) throw new GitHubError("No token", "unauthorized");
      return this.viewer;
    });
  }

  canPush() {
    return answer(() => this.pushAllowed);
  }

  createBranch(owner: string, repo: string, branch: string, fromSha: string) {
    this.#count("createBranch");
    return answer(() => {
      const r = this.#repo(owner, repo);
      if (r.branches[branch] && r.branches[branch] !== fromSha) {
        throw new GitHubError(
          `A branch named ${branch} already exists.`,
          "other",
        );
      }
      r.branches[branch] = fromSha;
    });
  }

  commit(request: CommitRequest) {
    this.#count("commit");
    this.commitRequests.push(request);
    return answer(() => {
      if (!this.token) throw new GitHubError("Add a token", "unauthorized");
      if (this.protectedBranches.has(request.branch)) {
        throw new GitHubError(
          "Changes must be made through a pull request.",
          "protected",
        );
      }
      const r = this.#repo(request.owner, request.repo);
      if (r.branches[request.branch] !== request.expectedHeadSha) {
        throw new GitHubError("Someone else committed", "stale");
      }
      const files = { ...this.commits.get(request.expectedHeadSha)! };
      Object.assign(files, request.additions);
      for (const path of request.deletions) delete files[path];
      const sha = this.#commitFiles(files);
      r.branches[request.branch] = sha;
      return {
        sha,
        url: `https://github.com/${r.owner}/${r.repo}/commit/${sha}`,
      };
    });
  }
}
