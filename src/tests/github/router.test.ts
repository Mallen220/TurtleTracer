// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ElectronAPI } from "../../types";
import { githubPath } from "../../utils/github/paths";
import { GitHubRepos } from "../../utils/github/repos";
import { memoryRepoStorage } from "../../utils/github/storage";
import { withGitHubRepos } from "../../utils/github/router";
import { FakeGitHub } from "./fakeGitHub";

const ref = { owner: "team", repo: "robot" };
const at = (p = "") => githubPath(ref, p);

function deviceFiles(): ElectronAPI & Record<string, any> {
  return {
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(async () => "on disk"),
    writeFile: vi.fn(async () => true),
    deleteFile: vi.fn(async () => true),
    fileExists: vi.fn(async () => true),
    resolvePath: vi.fn(async (_b: string, r: string) => `/disk/${r}`),
    makeRelativePath: vi.fn(async () => "relative"),
    createDirectory: vi.fn(async () => true),
    renameFile: vi.fn(async (_a: string, b: string) => ({
      success: true,
      newPath: b,
    })),
    copyFile: vi.fn(async () => true),
    writeFileBase64: vi.fn(async () => true),
    showSaveDialog: vi.fn(async () => "/disk/x.turt"),
    isVirtual: true,
  };
}

let base: ReturnType<typeof deviceFiles>;
let repos: GitHubRepos;
let api: ElectronAPI;

beforeEach(async () => {
  const github = new FakeGitHub();
  github.addRepo("team", "robot", { "Far.turt": "from github" });
  repos = new GitHubRepos(github, memoryRepoStorage());
  await repos.open(ref, "main");
  base = deviceFiles();
  api = withGitHubRepos(base, repos);
});

describe("withGitHubRepos", () => {
  it("returns the same object for the same file system", () => {
    expect(withGitHubRepos(base, repos)).toBe(api);
  });

  it("sends repository paths to the working copy and others to the device", async () => {
    expect(await api.readFile(at("Far.turt"))).toBe("from github");
    expect(await api.readFile("/disk/Far.turt")).toBe("on disk");

    await api.writeFile(at("New.turt"), "{}");
    expect(base.writeFile).not.toHaveBeenCalled();
    expect(await repos.readFile(at("New.turt"))).toBe("{}");

    await api.writeFile("/disk/New.turt", "{}");
    expect(base.writeFile).toHaveBeenCalledWith("/disk/New.turt", "{}");
  });

  it("passes everything else straight through", async () => {
    expect(api.isVirtual).toBe(true);
    expect(await api.showSaveDialog!()).toBe("/disk/x.turt");
  });

  it("resolves paths inside a repository and leaves the device's alone", async () => {
    expect(await api.resolvePath!(at("a/Far.turt"), "Code/Far.java")).toBe(
      at("a/Code/Far.java"),
    );
    expect(await api.resolvePath!("/disk/a.turt", "Code")).toBe("/disk/Code");
    expect(
      await api.makeRelativePath!(at("a/Far.turt"), at("b/Macro.turt")),
    ).toBe("../b/Macro.turt");
    // A repository project can't refer to a file on this device.
    await expect(
      api.makeRelativePath!(at("a/Far.turt"), "/disk/m.turt"),
    ).rejects.toThrow(/same repository/);
    await expect(
      api.resolvePath!(at("a/Far.turt"), "/disk/m.turt"),
    ).rejects.toThrow(/same repository/);
  });

  it("copies between GitHub and the device but won't move between them", async () => {
    await api.copyFile!(at("Far.turt"), "/disk/Far.turt");
    expect(base.writeFile).toHaveBeenCalledWith(
      "/disk/Far.turt",
      "from github",
    );
    await expect(
      api.renameFile!(at("Far.turt"), "/disk/Far.turt"),
    ).rejects.toThrow(/between GitHub and this device/);
    expect(base.renameFile).not.toHaveBeenCalled();
  });

  it("won't save images into a repository", async () => {
    await expect(api.writeFileBase64!(at("field.png"), "AAAA")).rejects.toThrow(
      /can't be saved into a GitHub repository/,
    );
  });

  it("gives git status and committed versions for repositories on any platform", async () => {
    await api.writeFile(at("Far.turt"), "edited");
    expect(await api.gitShow!(at("Far.turt"))).toBe("from github");
    expect(await api.gitStatus!(at())).toEqual({
      [at("Far.turt")]: "modified",
    });
    // The browser's file system has no git.
    expect(await api.gitShow!("/disk/Far.turt")).toBeNull();
    expect(await api.gitStatus!("/disk")).toEqual({});
  });

  it("works with the desktop app's API, which is frozen", async () => {
    const frozen = Object.freeze(deviceFiles());
    const desktop = withGitHubRepos(frozen, repos);
    expect(await desktop.readFile(at("Far.turt"))).toBe("from github");
    expect(await desktop.readFile("/disk/Far.turt")).toBe("on disk");
    expect(await desktop.gitStatus!("/disk")).toEqual({});
    expect(desktop.isVirtual).toBe(true);
  });

  it("only offers optional operations the device has", () => {
    delete base.copyFile;
    expect(api.copyFile).toBeUndefined();
    expect(api.saveFile).toBeUndefined();
    base.saveFile = vi.fn();
    expect(api.saveFile).toBeTypeOf("function");
  });
});
