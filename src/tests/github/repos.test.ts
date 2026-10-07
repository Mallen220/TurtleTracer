// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { githubPath } from "../../utils/github/paths";
import {
  AUTO_PATHS_FOLDER,
  GitHubRepos,
  gitBlobSha,
} from "../../utils/github/repos";
import {
  memoryRepoStorage,
  type RepoStorage,
} from "../../utils/github/storage";
import { parseGitHubLink } from "../../utils/github/links";
import { FakeGitHub } from "./fakeGitHub";

const ref = { owner: "team", repo: "robot" };
const at = (p = "") => githubPath(ref, p);
const AUTO = AUTO_PATHS_FOLDER;

const FILES = {
  "README.md": "# Robot\n",
  [`${AUTO}/Far.turt`]: '{"lines":[]}',
  [`${AUTO}/Near.turt`]: '{"lines":[1]}',
  "TeamCode/src/main/java/Auto.java": "class Auto {}",
};

let github: FakeGitHub;
let storage: RepoStorage;
let repos: GitHubRepos;

async function openRepo(branch = "main") {
  return repos.open(ref, branch);
}

beforeEach(() => {
  github = new FakeGitHub();
  github.addRepo("team", "robot", FILES);
  storage = memoryRepoStorage();
  repos = new GitHubRepos(github, storage);
});

describe("gitBlobSha", () => {
  it("matches git hash-object", async () => {
    expect(await gitBlobSha("hello\n")).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
    expect(await gitBlobSha("")).toBe(
      "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
    );
  });
});

describe("looking up a link", () => {
  it("finds the repository, its branches and the default branch", async () => {
    github.addBranch("team", "robot", "feature/auto");
    const target = await repos.lookUp(parseGitHubLink("team/robot")!);
    expect(target).toMatchObject({
      ...ref,
      kind: "repo",
      branch: "main",
      defaultBranch: "main",
      path: "",
    });
    expect(target.branches).toEqual(["main", "feature/auto"]);
  });

  it("splits a folder link into its branch and folder", async () => {
    github.addBranch("team", "robot", "feature/auto");
    const target = await repos.lookUp(
      parseGitHubLink(
        `https://github.com/team/robot/tree/feature/auto/${AUTO}`,
      )!,
    );
    expect(target).toMatchObject({ branch: "feature/auto", path: AUTO });
  });

  it("refuses private repositories and links to tags", async () => {
    github.addRepo("team", "secret", {}, { isPrivate: true });
    await expect(repos.lookUp(parseGitHubLink("team/secret")!)).rejects.toThrow(
      /Private repositories/,
    );
    await expect(
      repos.lookUp(parseGitHubLink("team/robot/tree/v1.0/TeamCode")!),
    ).rejects.toThrow(/tag or a single commit/);
  });
});

describe("browsing", () => {
  it("lists folders and files, files only once downloaded", async () => {
    await openRepo();
    const top = await repos.listFiles(at());
    expect(top.map((f) => [f.name, !!f.isDirectory]).sort()).toEqual([
      ["README.md", false],
      ["TeamCode", true],
    ]);
    const auto = await repos.listFiles(at(AUTO));
    expect(auto.map((f) => f.name).sort()).toEqual(["Far.turt", "Near.turt"]);
    expect(auto.every((f) => f.gitStatus === "clean")).toBe(true);
    expect(github.calls.readFile).toBeUndefined();
  });

  it("downloads a file once, then reads it from the working copy", async () => {
    await openRepo();
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe('{"lines":[]}');
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe('{"lines":[]}');
    expect(github.calls.readFile).toBe(1);
  });

  it("starts in the folder a link names, else the AutoPaths folder", async () => {
    const record = await openRepo();
    expect(repos.startFolder(record, "TeamCode/src")).toBe(at("TeamCode/src"));
    expect(repos.startFolder(record, `${AUTO}/Far.turt`)).toBe(at(AUTO));
    expect(repos.startFolder(record)).toBe(at(AUTO));
  });

  it("otherwise starts where the project files are", async () => {
    github.addRepo("team", "other", {
      "paths/red/a.turt": "{}",
      "paths/blue/b.turt": "{}",
      "README.md": "",
    });
    const record = await repos.open({ owner: "team", repo: "other" }, "main");
    expect(repos.startFolder(record)).toBe(
      githubPath({ owner: "team", repo: "other" }, "paths"),
    );
  });

  it("comes back to the folder browsed last", async () => {
    const record = await openRepo();
    await repos.rememberFolder(at("TeamCode/src/main"));
    expect(repos.startFolder(record)).toBe(at("TeamCode/src/main"));
  });

  it("explains a missing repository or file", async () => {
    await expect(repos.readFile(at("x.turt"))).rejects.toThrow(/isn't open/);
    await openRepo();
    await expect(repos.readFile(at("missing.turt"))).rejects.toThrow(
      /not found/,
    );
    await expect(repos.listFiles(at("nowhere"))).rejects.toThrow(/not found/);
  });
});

describe("editing", () => {
  beforeEach(() => openRepo());

  it("keeps edits here until they are committed", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), '{"lines":[2]}');
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe('{"lines":[2]}');
    expect(github.filesOn("team", "robot")[`${AUTO}/Far.turt`]).toBe(
      '{"lines":[]}',
    );
    expect(await repos.changes(ref)).toEqual([
      {
        path: at(`${AUTO}/Far.turt`),
        repoPath: `${AUTO}/Far.turt`,
        status: "modified",
      },
    ]);
    const listed = await repos.listFiles(at(AUTO));
    expect(listed.find((f) => f.name === "Far.turt")?.gitStatus).toBe(
      "modified",
    );
  });

  it("forgets an edit that puts a file back as it was", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "changed");
    await repos.writeFile(at(`${AUTO}/Far.turt`), '{"lines":[]}');
    expect(await repos.changes(ref)).toEqual([]);
  });

  it("adds new files and folders", async () => {
    await repos.createDirectory(at(`${AUTO}/Red`));
    expect(await repos.fileExists(at(`${AUTO}/Red`))).toBe(true);
    expect(
      (await repos.listFiles(at(AUTO))).find((f) => f.name === "Red"),
    ).toMatchObject({ isDirectory: true });

    await repos.writeFile(at(`${AUTO}/Red/Close.turt`), "{}");
    expect((await repos.listFiles(at(`${AUTO}/Red`)))[0]).toMatchObject({
      name: "Close.turt",
      gitStatus: "untracked",
    });
    expect((await repos.changes(ref))[0].status).toBe("added");
  });

  it("deletes project files", async () => {
    await repos.deleteFile(at(`${AUTO}/Far.turt`));
    expect(await repos.fileExists(at(`${AUTO}/Far.turt`))).toBe(false);
    expect((await repos.changes(ref))[0].status).toBe("deleted");
  });

  it("won't delete or rename folders that came from GitHub", async () => {
    await expect(repos.deleteFile(at("TeamCode"))).rejects.toThrow(
      /Folders that are on GitHub/,
    );
    await expect(
      repos.renameFile(at(AUTO), at("TeamCode/src/main/assets/Paths")),
    ).rejects.toThrow(/Folders that are on GitHub/);
    expect(await repos.changes(ref)).toEqual([]);
  });

  it("deletes and renames folders made here", async () => {
    await repos.createDirectory(at(`${AUTO}/Red`));
    await repos.writeFile(at(`${AUTO}/Red/Close.turt`), "{}");
    await repos.renameFile(at(`${AUTO}/Red`), at(`${AUTO}/Blue`));
    expect(await repos.readFile(at(`${AUTO}/Blue/Close.turt`))).toBe("{}");
    await repos.deleteFile(at(`${AUTO}/Blue`));
    expect(await repos.fileExists(at(`${AUTO}/Blue`))).toBe(false);
    expect(await repos.changes(ref)).toEqual([]);
  });

  it("deleting a file that was only added here leaves nothing to commit", async () => {
    await repos.writeFile(at("New.turt"), "{}");
    await repos.deleteFile(at("New.turt"));
    expect(await repos.changes(ref)).toEqual([]);
  });

  it("renames and moves project files", async () => {
    await repos.renameFile(at(`${AUTO}/Far.turt`), at(`${AUTO}/Far2.turt`));
    expect(await repos.readFile(at(`${AUTO}/Far2.turt`))).toBe('{"lines":[]}');
    expect(await repos.fileExists(at(`${AUTO}/Far.turt`))).toBe(false);
    await repos.renameFile(at(`${AUTO}/Far2.turt`), at("Far2.turt"));
    expect(await repos.fileExists(at("Far2.turt"))).toBe(true);
  });

  it("won't rename over an existing file", async () => {
    await expect(
      repos.renameFile(at(`${AUTO}/Far.turt`), at(`${AUTO}/Near.turt`)),
    ).rejects.toThrow(/already exists/);
  });

  it("refuses to write over a folder", async () => {
    await expect(repos.writeFile(at("TeamCode"), "x")).rejects.toThrow(
      /folder/,
    );
  });

  it("shows GitHub's version for diffs, and what changed for status", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    await repos.writeFile(at("New.turt"), "{}");
    expect(await repos.gitShow(at(`${AUTO}/Far.turt`))).toBe('{"lines":[]}');
    expect(await repos.gitShow(at("New.turt"))).toBeNull();
    expect(await repos.gitStatus(at(AUTO))).toEqual({
      [at(`${AUTO}/Far.turt`)]: "modified",
      [at("New.turt")]: "untracked",
    });
  });

  it("discards some or all edits", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "a");
    await repos.writeFile(at(`${AUTO}/Near.turt`), "b");
    await repos.discard(ref, [at(`${AUTO}/Far.turt`)]);
    expect((await repos.changes(ref)).map((c) => c.repoPath)).toEqual([
      `${AUTO}/Near.turt`,
    ]);
    await repos.discard(ref);
    expect(await repos.changes(ref)).toEqual([]);
  });

  it("keeps edits after the page reloads", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    const reloaded = new GitHubRepos(github, storage);
    expect(await reloaded.readFile(at(`${AUTO}/Far.turt`))).toBe("edited");
    expect(get(reloaded.summaries)).toEqual([
      { ...ref, branch: "main", changeCount: 1 },
    ]);
  });
});

describe("committing", () => {
  beforeEach(() => openRepo());

  it("sends every edit in one commit, including generated code", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), '{"lines":[3]}');
    await repos.writeFile(
      at("TeamCode/src/main/java/Far.java"),
      "class Far {}",
    );
    await repos.deleteFile(at(`${AUTO}/Near.turt`));

    const result = await repos.commit(ref, "Update Far");

    expect(github.commitRequests).toHaveLength(1);
    expect(github.commitRequests[0]).toMatchObject({
      ...ref,
      branch: "main",
      message: "Update Far",
      additions: {
        [`${AUTO}/Far.turt`]: '{"lines":[3]}',
        "TeamCode/src/main/java/Far.java": "class Far {}",
      },
      deletions: [`${AUTO}/Near.turt`],
    });
    expect(result.url).toContain("github.com/team/robot/commit/");
    const onGitHub = github.filesOn("team", "robot");
    expect(onGitHub[`${AUTO}/Far.turt`]).toBe('{"lines":[3]}');
    expect(onGitHub[`${AUTO}/Near.turt`]).toBeUndefined();
  });

  it("is then up to date with GitHub", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "new");
    await repos.commit(ref, "Update");
    expect(await repos.changes(ref)).toEqual([]);
    expect(await repos.update(ref)).toEqual({ status: "up-to-date" });
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("new");
    // A second edit commits on top of the first.
    await repos.writeFile(at(`${AUTO}/Far.turt`), "newer");
    await repos.commit(ref, "Again");
    expect(github.filesOn("team", "robot")[`${AUTO}/Far.turt`]).toBe("newer");
  });

  it("refuses when there's nothing to commit", async () => {
    await expect(repos.commit(ref, "Nothing")).rejects.toThrow(/nothing/);
  });

  it("keeps the edits if GitHub has moved on, so they can be updated and retried", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "mine");
    github.push("team", "robot", "main", { "README.md": "# Changed\n" });
    await expect(repos.commit(ref, "Update")).rejects.toMatchObject({
      kind: "stale",
    });
    expect(await repos.changes(ref)).toHaveLength(1);

    expect(await repos.update(ref)).toEqual({
      status: "updated",
      changedOnGitHub: [at("README.md")],
      copies: [],
    });
    await repos.commit(ref, "Update");
    expect(github.filesOn("team", "robot")).toMatchObject({
      "README.md": "# Changed\n",
      [`${AUTO}/Far.turt`]: "mine",
    });
  });

  it("keeps anything edited again while the commit was being sent", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "first");
    const commit = repos.commit(ref, "Update");
    await repos.writeFile(at(`${AUTO}/Far.turt`), "second");
    await commit;
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("second");
    expect((await repos.changes(ref))[0].status).toBe("modified");
  });
});

describe("updating from GitHub", () => {
  beforeEach(() => openRepo());

  it("brings in other people's commits and keeps edits made here", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "mine");
    github.push("team", "robot", "main", {
      [`${AUTO}/Near.turt`]: "theirs",
      [`${AUTO}/New.turt`]: "{}",
    });
    const result = await repos.update(ref);
    expect(result).toEqual({
      status: "updated",
      changedOnGitHub: [at(`${AUTO}/Near.turt`), at(`${AUTO}/New.turt`)],
      copies: [],
    });
    expect(await repos.readFile(at(`${AUTO}/Near.turt`))).toBe("theirs");
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("mine");
  });

  it("asks which to keep when a file changed both here and on GitHub", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "mine");
    github.push("team", "robot", "main", { [`${AUTO}/Far.turt`]: "theirs" });

    expect(await repos.update(ref)).toEqual({
      status: "conflicts",
      conflicts: [at(`${AUTO}/Far.turt`)],
    });
    // Nothing changed yet.
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("mine");

    await repos.update(ref, "mine");
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("mine");
    await repos.commit(ref, "Keep mine");
    expect(github.filesOn("team", "robot")[`${AUTO}/Far.turt`]).toBe("mine");
  });

  it("can take GitHub's version instead", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "mine");
    github.push("team", "robot", "main", { [`${AUTO}/Far.turt`]: "theirs" });
    await repos.update(ref, "theirs");
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("theirs");
    expect(await repos.changes(ref)).toEqual([]);
  });

  it("isn't a conflict when both sides made the same change", async () => {
    await repos.writeFile(at(`${AUTO}/Far.turt`), "same");
    github.push("team", "robot", "main", { [`${AUTO}/Far.turt`]: "same" });
    expect((await repos.update(ref)).status).toBe("updated");
    expect(await repos.changes(ref)).toEqual([]);
  });
});

describe("opening and closing", () => {
  it("reopening a repository with edits keeps them", async () => {
    await openRepo();
    await repos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    await openRepo();
    expect(await repos.readFile(at(`${AUTO}/Far.turt`))).toBe("edited");
  });

  it("won't switch branches while edits aren't committed", async () => {
    github.addBranch("team", "robot", "dev");
    await openRepo();
    await repos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    await expect(openRepo("dev")).rejects.toThrow(/Switch branch/);
    await repos.discard(ref);
    expect((await openRepo("dev")).branch).toBe("dev");
  });

  it("closing removes the working copy", async () => {
    await openRepo();
    await repos.writeFile(at(`${AUTO}/Far.turt`), "edited");
    await repos.close(ref);
    expect(await repos.get(ref)).toBeUndefined();
    expect(get(repos.summaries)).toEqual([]);
    expect(await new GitHubRepos(github, storage).get(ref)).toBeUndefined();
  });
});
