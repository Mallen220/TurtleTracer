// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The ways a working copy could lose or overwrite someone's work, and what
// stops each one.
import { describe, it, expect, beforeEach } from "vitest";
import { get } from "svelte/store";
import { githubPath } from "../../utils/github/paths";
import {
  GitHubRepos,
  MAX_FILE_BYTES,
  OTHER_TAB_MESSAGE,
  StaleFileError,
  type EditingLock,
} from "../../utils/github/repos";
import {
  memoryRepoStorage,
  type RepoStorage,
} from "../../utils/github/storage";
import { FakeGitHub } from "./fakeGitHub";

const ref = { owner: "team", repo: "robot" };
const at = (p: string) => githubPath(ref, p);
const FAR = "AutoPaths/Far.turt";
const project = (x: number, version = "2.4.0") =>
  JSON.stringify({ version, startPoint: { x }, lines: [] }, null, 2);

let github: FakeGitHub;
let storage: RepoStorage;
let repos: GitHubRepos;

beforeEach(async () => {
  github = new FakeGitHub();
  github.addRepo("team", "robot", {
    [FAR]: project(1),
    "AutoPaths/Near.turt": project(2),
  });
  storage = memoryRepoStorage();
  repos = new GitHubRepos(github, storage);
  await repos.open(ref, "main");
});

/** A lock another tab holds until `release` is called. */
function heldElsewhere() {
  let held = false;
  let release!: () => void;
  const lock: EditingLock = {
    held: () => held,
    acquired: new Promise<void>((resolve) => {
      release = () => {
        held = true;
        resolve();
      };
    }),
  };
  return { lock, release: () => release() };
}

describe("two tabs", () => {
  it("only one tab can change repositories; the other can still look", async () => {
    const { lock } = heldElsewhere();
    const second = new GitHubRepos(github, storage, lock);
    expect(get(second.editable)).toBe(false);
    expect(await second.readFile(at(FAR))).toBe(project(1));
    await expect(second.writeFile(at(FAR), project(5))).rejects.toThrow(
      OTHER_TAB_MESSAGE,
    );
    await expect(second.commit(ref, "x")).rejects.toThrow(OTHER_TAB_MESSAGE);
  });

  it("the waiting tab takes over when the other closes, with its edits", async () => {
    const { lock, release } = heldElsewhere();
    const second = new GitHubRepos(github, storage, lock);
    await second.ready();
    await repos.writeFile(at(FAR), project(7)); // the first tab edits

    release(); // the first tab closes
    await lock.acquired;
    await new Promise((r) => setTimeout(r, 0));

    expect(get(second.editable)).toBe(true);
    expect(await second.readFile(at(FAR))).toBe(project(7));
    await second.writeFile(at("AutoPaths/Near.turt"), project(8));
    expect((await second.changes(ref)).map((c) => c.repoPath)).toEqual([
      FAR,
      "AutoPaths/Near.turt",
    ]);
  });
});

describe("saving", () => {
  it("says so when this device won't keep the edit", async () => {
    storage.saveRepo = async () => {
      throw new Error("QuotaExceededError");
    };
    await expect(repos.writeFile(at(FAR), project(3))).rejects.toThrow(
      /Couldn't keep your changes on this device.*Commit them now/,
    );
  });

  it("won't replace a version someone committed since the file was opened", async () => {
    await repos.noteOpened(at(FAR));
    github.push("team", "robot", "main", { [FAR]: project(9) });
    await repos.update(ref); // a teammate's commit arrives

    await expect(repos.writeFile(at(FAR), project(4))).rejects.toThrow(
      StaleFileError,
    );
    expect(await repos.readFile(at(FAR))).toBe(project(9));

    await repos.acceptGitHubVersion(at(FAR)); // "Save anyway"
    await repos.writeFile(at(FAR), project(4));
    expect(await repos.readFile(at(FAR))).toBe(project(4));
  });

  it("keeps saving normally after committing the open file", async () => {
    await repos.noteOpened(at(FAR));
    await repos.writeFile(at(FAR), project(4));
    await repos.commit(ref, "First");
    await repos.writeFile(at(FAR), project(5));
    expect((await repos.changes(ref))[0].repoPath).toBe(FAR);
  });

  it("doesn't count a save that only changes the app version", async () => {
    await repos.writeFile(at(FAR), project(1, "2.9.0"));
    expect(await repos.changes(ref)).toEqual([]);
    await repos.writeFile(at(FAR), project(2, "2.9.0"));
    expect(await repos.changes(ref)).toHaveLength(1);
  });

  it("refuses files too big to handle", async () => {
    await expect(
      repos.writeFile(at("Huge.turt"), "x".repeat(MAX_FILE_BYTES + 1)),
    ).rejects.toThrow(/too big to save/);
  });
});

describe("conflicts", () => {
  it("can keep both versions, so nobody's work is thrown away", async () => {
    await repos.writeFile(at(FAR), project(5));
    github.push("team", "robot", "main", { [FAR]: project(6) });

    const result = await repos.update(ref, "both");
    expect(result).toMatchObject({
      status: "updated",
      copies: [at("AutoPaths/Far (my version).turt")],
    });
    expect(await repos.readFile(at(FAR))).toBe(project(6));
    expect(await repos.readFile(at("AutoPaths/Far (my version).turt"))).toBe(
      project(5),
    );
  });
});

describe("branches", () => {
  it("commits to a new branch and links to a pull request", async () => {
    await repos.writeFile(at(FAR), project(5));
    const result = await repos.commit(ref, "Try a new auto", {
      newBranch: "paths/new-auto",
    });
    expect(result.branch).toBe("paths/new-auto");
    expect(result.pullRequestUrl).toBe(
      "https://github.com/team/robot/compare/main...paths%2Fnew-auto?expand=1",
    );
    expect(github.filesOn("team", "robot", "paths/new-auto")[FAR]).toBe(
      project(5),
    );
    expect(github.filesOn("team", "robot", "main")[FAR]).toBe(project(1));
    expect((await repos.get(ref))?.branch).toBe("paths/new-auto");
  });

  it("explains when a branch only takes pull requests", async () => {
    github.protectedBranches.add("main");
    await repos.writeFile(at(FAR), project(5));
    await expect(repos.commit(ref, "x")).rejects.toMatchObject({
      kind: "protected",
    });
    expect(await repos.changes(ref)).toHaveLength(1);
  });

  it("moves edits to another branch, e.g. after theirs was deleted", async () => {
    github.addBranch("team", "robot", "dev");
    await repos.writeFile(at(FAR), project(5));
    github.deleteBranch("team", "robot", "main");

    await expect(repos.update(ref)).rejects.toThrow(/isn't on GitHub any more/);
    expect(await repos.switchBranch(ref, "dev")).toMatchObject({
      status: "updated",
    });
    expect((await repos.get(ref))?.branch).toBe("dev");
    expect(await repos.readFile(at(FAR))).toBe(project(5));
    await repos.commit(ref, "Saved");
    expect(github.filesOn("team", "robot", "dev")[FAR]).toBe(project(5));
  });

  it("hands over the edits so they can be copied somewhere else", async () => {
    await repos.writeFile(at(FAR), project(5));
    await repos.deleteFile(at("AutoPaths/Near.turt"));
    expect(await repos.changedFiles(ref)).toEqual([
      { repoPath: FAR, content: project(5) },
    ]);
  });
});
