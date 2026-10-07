// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  githubPath,
  isGitHubPath,
  parentOf,
  parseGitHubPath,
  relativeGitHubPath,
  resolveGitHubPath,
} from "../../utils/github/paths";
import { parseGitHubLink, splitRef } from "../../utils/github/links";

const repo = { owner: "team", repo: "robot" };
const at = (p: string) => githubPath(repo, p);

describe("GitHub app paths", () => {
  it("puts repository files under /@github/owner/repo", () => {
    expect(at("TeamCode/a.turt")).toBe("/@github/team/robot/TeamCode/a.turt");
    expect(at("")).toBe("/@github/team/robot");
    expect(parseGitHubPath("/@github/team/robot/TeamCode/a.turt")).toEqual({
      ...repo,
      repoPath: "TeamCode/a.turt",
    });
    expect(parseGitHubPath("/@github/team/robot")).toEqual({
      ...repo,
      repoPath: "",
    });
  });

  it("tells repository paths from paths on this device", () => {
    expect(isGitHubPath(at("x.turt"))).toBe(true);
    expect(isGitHubPath("/browser_fs/x.turt")).toBe(false);
    expect(isGitHubPath(String.raw`C:\Users\me\x.turt`)).toBe(false);
    expect(isGitHubPath("/@githubber/x")).toBe(false);
    expect(isGitHubPath(null)).toBe(false);
    expect(parseGitHubPath("/@github/team")).toBeNull();
  });

  it("knows a path's folder", () => {
    expect(parentOf("a/b/c.turt")).toBe("a/b");
    expect(parentOf("c.turt")).toBe("");
  });

  it("resolves paths relative to a file, like the desktop app", () => {
    const project = at("TeamCode/src/main/assets/AutoPaths/Far.turt");
    expect(resolveGitHubPath(project, "GeneratedCode/Far.java")).toBe(
      at("TeamCode/src/main/assets/AutoPaths/GeneratedCode/Far.java"),
    );
    expect(
      resolveGitHubPath(project, "../../java/org/firstinspires/ftc/teamcode"),
    ).toBe(at("TeamCode/src/main/java/org/firstinspires/ftc/teamcode"));
    expect(resolveGitHubPath(project, String.raw`..\shared\macro.turt`)).toBe(
      at("TeamCode/src/main/assets/shared/macro.turt"),
    );
  });

  it("won't reach files on this computer or in another repository", () => {
    // A project anyone can publish mustn't make the app read local files.
    const project = at("Far.turt");
    for (const path of [
      "/Users/student/Documents/Secret.turt",
      String.raw`C:\Users\student\Secret.turt`,
      String.raw`\\server\share\Secret.turt`,
      githubPath({ owner: "other", repo: "repo" }, "Secret.turt"),
    ]) {
      expect(() => resolveGitHubPath(project, path), path).toThrow(
        /only use files in the same repository/,
      );
    }
    expect(resolveGitHubPath(project, at("a/Macro.turt"))).toBe(
      at("a/Macro.turt"),
    );
  });

  it("refuses paths that leave the repository", () => {
    expect(() => resolveGitHubPath(at("a/Far.turt"), "../../x")).toThrow(
      /outside the repository/,
    );
  });

  it("makes paths relative within one repository only", () => {
    const project = at("TeamCode/assets/AutoPaths/Far.turt");
    expect(
      relativeGitHubPath(project, at("TeamCode/assets/macros/Score.turt")),
    ).toBe("../macros/Score.turt");
    expect(
      relativeGitHubPath(project, at("TeamCode/assets/AutoPaths/B.turt")),
    ).toBe("B.turt");
    // Saving a reference to a file on this computer would put its path,
    // often with the student's name, into a commit.
    expect(() => relativeGitHubPath(project, "/Users/me/Score.turt")).toThrow(
      /only use files in the same repository/,
    );
    const otherRepo = githubPath({ owner: "x", repo: "y" }, "Score.turt");
    expect(() => relativeGitHubPath(project, otherRepo)).toThrow(
      /another repository/,
    );
    // A project on this computer may use a repository file.
    expect(relativeGitHubPath("/Users/me/Far.turt", otherRepo)).toBe(otherRepo);
  });

  it("round-trips a relative path", () => {
    const project = at("TeamCode/assets/AutoPaths/Far.turt");
    const macro = at("TeamCode/shared/Score.turt");
    expect(resolveGitHubPath(project, relativeGitHubPath(project, macro))).toBe(
      macro,
    );
  });
});

describe("parseGitHubLink", () => {
  it("reads repository links in the forms people paste", () => {
    for (const link of [
      "https://github.com/team/robot",
      "https://github.com/team/robot/",
      "http://www.github.com/team/robot.git",
      "github.com/team/robot",
      "team/robot",
      "git@github.com:team/robot.git",
      "https://github.com/team/robot?tab=readme-ov-file#setup",
      "  https://github.com/team/robot  ",
    ]) {
      expect(parseGitHubLink(link), link).toEqual({
        ...repo,
        kind: "repo",
        refAndPath: [],
      });
    }
  });

  it("reads links to a folder or file on a branch", () => {
    expect(
      parseGitHubLink(
        "https://github.com/team/robot/tree/main/TeamCode/src/main/assets/AutoPaths",
      ),
    ).toEqual({
      ...repo,
      kind: "folder",
      refAndPath: ["main", "TeamCode", "src", "main", "assets", "AutoPaths"],
    });
    expect(
      parseGitHubLink(
        "https://github.com/team/robot/blob/main/Far%20Side.turt",
      ),
    ).toEqual({ ...repo, kind: "file", refAndPath: ["main", "Far Side.turt"] });
  });

  it("treats other pages of a repository as the repository", () => {
    expect(parseGitHubLink("https://github.com/team/robot/pulls")?.kind).toBe(
      "repo",
    );
  });

  it("rejects things that aren't repository links", () => {
    for (const text of [
      "",
      "hello",
      "https://gitlab.com/team/robot",
      "https://github.com/team",
      "team/robot name",
    ]) {
      expect(parseGitHubLink(text), text).toBeNull();
    }
  });
});

describe("splitRef", () => {
  it("matches the longest branch name, which can contain slashes", () => {
    const branches = ["main", "feature", "feature/new-auto"];
    expect(
      splitRef(["feature", "new-auto", "TeamCode", "Far.turt"], branches),
    ).toEqual({ branch: "feature/new-auto", path: "TeamCode/Far.turt" });
    expect(splitRef(["feature", "TeamCode"], branches)).toEqual({
      branch: "feature",
      path: "TeamCode",
    });
    expect(splitRef(["main"], branches)).toEqual({ branch: "main", path: "" });
  });

  it("is null for tags and commits", () => {
    expect(splitRef(["v1.0", "TeamCode"], ["main"])).toBeNull();
  });
});
