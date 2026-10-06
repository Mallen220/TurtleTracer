// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Files in a GitHub repository appear in the app as paths under one folder:
// /@github/<owner>/<repo>/<path in the repository>. The rest of the app can
// then treat them like any other file.

export const GITHUB_ROOT = "/@github";

export interface RepoRef {
  owner: string;
  repo: string;
}

/** A path inside a repository, as an app path or split into its parts. */
export interface RepoPath extends RepoRef {
  /** Slash-separated path inside the repository; "" is its top folder. */
  repoPath: string;
}

export const repoKey = ({ owner, repo }: RepoRef) => `${owner}/${repo}`;

export function isGitHubPath(path: string | null | undefined): boolean {
  return (
    typeof path === "string" &&
    (path === GITHUB_ROOT || path.startsWith(GITHUB_ROOT + "/"))
  );
}

/** The app path of `repoPath` inside a repository. */
export function githubPath(ref: RepoRef, repoPath = ""): string {
  return [GITHUB_ROOT, ref.owner, ref.repo, ...splitPath(repoPath)].join("/");
}

/** The repository and path inside it that an app path points to, or null. */
export function parseGitHubPath(path: string): RepoPath | null {
  if (!isGitHubPath(path)) return null;
  const [owner, repo, ...rest] = splitPath(path.slice(GITHUB_ROOT.length));
  if (!owner || !repo) return null;
  return { owner, repo, repoPath: normalizeRepoPath(rest) };
}

const splitPath = (path: string) => path.split(/[\\/]/).filter(Boolean);

/** Resolves "." and ".." segments. Throws if ".." would leave the repository. */
function normalizeRepoPath(segments: string[]): string {
  const out: string[] = [];
  for (const segment of segments) {
    if (segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) {
        throw new Error("That path leads outside the repository.");
      }
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.join("/");
}

/** The folder a repository path is in ("" for the top folder). */
export const parentOf = (repoPath: string) =>
  repoPath.includes("/") ? repoPath.slice(0, repoPath.lastIndexOf("/")) : "";

const isAbsolute = (path: string) =>
  path.startsWith("/") || path.startsWith("\\") || /^[A-Za-z]:/.test(path);

const outsideRepoError = (path: string) =>
  new Error(
    `Projects in a GitHub repository can only use files in the same repository, not ${path}.`,
  );

/**
 * `relative` resolved against the folder holding the file at `base`, like
 * the desktop app's resolvePath. It must stay inside the repository: a
 * project anyone can publish mustn't make the app read files on this
 * computer, or save their paths into a commit.
 */
export function resolveGitHubPath(base: string, relative: string): string {
  if (isAbsolute(relative) && !isGitHubPath(relative)) {
    throw outsideRepoError(`"${relative}" on this computer`);
  }
  const from = parseGitHubPath(base);
  if (!from) throw new Error(`Not a GitHub path: ${base}`);
  if (isGitHubPath(relative)) {
    const to = parseGitHubPath(relative);
    if (!to || repoKey(to) !== repoKey(from)) {
      throw outsideRepoError("another repository");
    }
    return githubPath(to, to.repoPath);
  }
  const repoPath = normalizeRepoPath([
    ...splitPath(parentOf(from.repoPath)),
    ...splitPath(relative),
  ]);
  return githubPath(from, repoPath);
}

/**
 * `target` relative to the folder holding the file at `base`, like the
 * desktop app's makeRelativePath. For a project in a repository the target
 * must be in the same repository. A project on this computer may refer to a
 * repository file by its app path.
 */
export function relativeGitHubPath(base: string, target: string): string {
  const from = parseGitHubPath(base);
  const to = parseGitHubPath(target);
  if (!from) return target;
  if (!to) throw outsideRepoError(`"${target}" on this computer`);
  if (repoKey(from) !== repoKey(to)) {
    throw outsideRepoError("another repository");
  }

  const fromParts = splitPath(parentOf(from.repoPath));
  const toParts = splitPath(to.repoPath);
  let common = 0;
  while (
    common < fromParts.length &&
    common < toParts.length &&
    fromParts[common] === toParts[common]
  ) {
    common++;
  }
  const up = fromParts.slice(common).map(() => "..");
  return [...up, ...toParts.slice(common)].join("/");
}
