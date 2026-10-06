// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { RepoRef } from "./paths";

/** What a pasted GitHub link points at. */
export interface GitHubLink extends RepoRef {
  /** A whole repository, a folder on a branch, or one file on a branch. */
  kind: "repo" | "folder" | "file";
  /**
   * For folder and file links, everything after /tree/ or /blob/: the branch
   * name followed by the path. Branch names can contain slashes, so the two
   * can only be told apart with the repository's branch list (see splitRef).
   */
  refAndPath: string[];
}

const NAME = /^[A-Za-z0-9_.-]+$/;

/**
 * Reads a GitHub link: a repository page, a folder or file on a branch
 * (/tree/... or /blob/...), a clone URL, or just "owner/repo". Returns null
 * if it isn't one.
 */
export function parseGitHubLink(input: string): GitHubLink | null {
  let text = input.trim();
  if (!text) return null;

  // git@github.com:owner/repo.git
  text = text.replace(/^git@github\.com:/i, "github.com/");
  text = text.replace(/^(https?:\/\/)?(www\.)?github\.com\//i, "");
  text = text.replace(/[?#].*$/, "");

  const segments = text
    .split("/")
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const [owner, rawRepo, view, ...rest] = segments;
  const repo = rawRepo?.replace(/\.git$/i, "");
  if (!owner || !repo || !NAME.test(owner) || !NAME.test(repo)) return null;

  if ((view === "tree" || view === "blob") && rest.length > 0) {
    return {
      owner,
      repo,
      kind: view === "blob" ? "file" : "folder",
      refAndPath: rest,
    };
  }
  return { owner, repo, kind: "repo", refAndPath: [] };
}

/**
 * Splits a link's branch and path using the repository's branches, matching
 * the longest branch name. Returns null if no branch matches (for example a
 * link to a tag or a single commit, which can't be edited).
 */
export function splitRef(
  refAndPath: string[],
  branches: string[],
): { branch: string; path: string } | null {
  let best: string | null = null;
  for (const branch of branches) {
    const parts = branch.split("/");
    const matches =
      parts.length <= refAndPath.length &&
      parts.every((part, i) => part === refAndPath[i]);
    if (matches && (!best || parts.length > best.split("/").length)) {
      best = branch;
    }
  }
  if (!best) return null;
  return {
    branch: best,
    path: refAndPath.slice(best.split("/").length).join("/"),
  };
}
