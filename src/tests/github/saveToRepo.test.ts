// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Saving a project that lives in a GitHub repository, with auto-export on:
// both the project and its generated code go into the working copy and are
// committed together.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { get } from "svelte/store";
import { githubPath } from "../../utils/github/paths";
import { pathInMessage } from "../../utils/messagePaths";
import type { FakeGitHub } from "./fakeGitHub";

const AUTO = "TeamCode/src/main/assets/AutoPaths";

vi.mock("../../utils/github/repos", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../../utils/github/repos")>();
  const { FakeGitHub } = await import("./fakeGitHub");
  const { memoryRepoStorage } = await import("../../utils/github/storage");
  const github = new FakeGitHub();
  github.addRepo("team", "robot", {
    "TeamCode/src/main/assets/AutoPaths/Far.turt": "{}",
  });
  return {
    ...actual,
    fakeGitHub: github,
    githubRepos: new actual.GitHubRepos(github, memoryRepoStorage()),
  };
});

const reposModule =
  (await import("../../utils/github/repos")) as typeof import("../../utils/github/repos") & {
    fakeGitHub: FakeGitHub;
  };
const { githubRepos } = reposModule;
const { saveProject } = await import("../../utils/fileHandlers");
const { currentFilePath, isUnsaved, notification } =
  await import("../../stores");
const { settingsStore, linesStore, sequenceStore } =
  await import("../../lib/projectStore");
const { exporterRegistry } = await import("../../lib/exporters");

const ref = { owner: "team", repo: "robot" };
const at = (p: string) => githubPath(ref, p);

beforeEach(async () => {
  // The device's own file system; nothing here should be written to it.
  (globalThis as any).electronAPI = {
    listFiles: vi.fn(async () => []),
    readFile: vi.fn(),
    writeFile: vi.fn(async () => true),
    deleteFile: vi.fn(),
    fileExists: vi.fn(async () => false),
    resolvePath: vi.fn(),
    makeRelativePath: vi.fn(),
    createDirectory: vi.fn(),
    saveFile: vi.fn(async () => ({ success: true, filepath: "/disk" })),
    isVirtual: true,
  };
  exporterRegistry.register({
    id: "java",
    name: "Java",
    // Like the real exporter: marked as generated, in the given package.
    exportCode: (_data, settings) =>
      `// Turtle Tracer — Auto-Generated\npackage ${settings.packageName};\nclass ${settings.fileName.replaceAll(/\W/g, "_")} {}`,
  });
  await githubRepos.open(ref, "main");
  await githubRepos.discard(ref);

  settingsStore.update((s) => ({
    ...s,
    autoExportCode: true,
    autoExportFormat: "java",
    autoExportPathMode: "relative",
    autoExportPath: "../../java/org/firstinspires/ftc/teamcode/autos",
    autoExportFullClass: true,
    javaPackageName: "org.firstinspires.ftc.teamcode.wrong",
  }));
  notification.set(null as any);
  linesStore.set([
    {
      id: "l1",
      endPoint: { x: 30, y: 40, heading: "tangential" },
      controlPoints: [],
      color: "#fff",
    } as any,
  ]);
  sequenceStore.set([{ kind: "path", lineId: "l1" }]);
  currentFilePath.set(at(`${AUTO}/Far.turt`));
  isUnsaved.set(true);
});

describe("saving a project from a GitHub repository", () => {
  it("writes the project and its generated code into the working copy", async () => {
    expect(await saveProject({ quiet: true })).toBe(true);

    const changes = await githubRepos.changes(ref);
    expect(changes.map((c) => [c.repoPath, c.status])).toEqual([
      [`${AUTO}/Far.turt`, "modified"],
      [
        "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/autos/Far.java",
        "added",
      ],
    ]);
    const saved = JSON.parse(
      await githubRepos.readFile(at(`${AUTO}/Far.turt`)),
    );
    expect(saved.lines[0].endPoint).toMatchObject({ x: 30, y: 40 });

    const device = (globalThis as any).electronAPI;
    expect(device.writeFile).not.toHaveBeenCalled();
    expect(device.saveFile).not.toHaveBeenCalled();
    expect(get(isUnsaved)).toBe(false);
  });

  it("commits both in one commit", async () => {
    await saveProject({ quiet: true });
    await githubRepos.commit(ref, "Update Far");

    const github = reposModule.fakeGitHub;
    expect(github.commitRequests).toHaveLength(1);
    expect(Object.keys(github.commitRequests[0].additions).sort()).toEqual([
      `${AUTO}/Far.turt`,
      "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/autos/Far.java",
    ]);
    expect(
      github.filesOn("team", "robot")[
        "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/autos/Far.java"
      ],
    ).toContain("class Far {}");
  });

  it("leaves the code out when auto-export is off", async () => {
    settingsStore.update((s) => ({ ...s, autoExportCode: false }));
    // An edit that hasn't been committed by an earlier test.
    linesStore.update(([line]) => [
      { ...line, endPoint: { ...line.endPoint, x: 55 } },
    ]);
    await saveProject({ quiet: true });
    expect((await githubRepos.changes(ref)).map((c) => c.repoPath)).toEqual([
      `${AUTO}/Far.turt`,
    ]);
  });

  it("names the Java file after its class and its package after its folder", async () => {
    currentFilePath.set(at(`${AUTO}/Far Side.turt`));
    await saveProject({ quiet: true });
    const java = at(
      "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/autos/Far_Side.java",
    );
    const code = await githubRepos.readFile(java);
    expect(code).toContain("class Far_Side {}");
    expect(code).toContain("package org.firstinspires.ftc.teamcode.autos;");
  });

  it("won't put Java where it isn't compiled, and offers the path that works", async () => {
    settingsStore.update((s) => ({ ...s, autoExportPath: "GeneratedCode" }));
    currentFilePath.set(at(`${AUTO}/Assets.turt`));
    await saveProject({ quiet: true });
    const notice = get(notification)!;
    expect(notice).toMatchObject({
      type: "warning",
      timeout: 0,
      actionLabel: "Use this path",
    });
    const generated = `${AUTO}/GeneratedCode`;
    expect(notice.message).toBe(
      `Assets.java wasn't exported: ${pathInMessage(generated)} isn't compiled. Set the Auto Export path to ${pathInMessage("../../java/org/firstinspires/ftc/teamcode/wrong")} to put it in ${pathInMessage("TeamCode/src/main/java/org/firstinspires/ftc/teamcode/wrong")}.`,
    );
    const changed = async () =>
      (await githubRepos.changes(ref)).map((c) => c.repoPath);
    expect(await changed()).not.toContain(`${AUTO}/GeneratedCode/Assets.java`);

    await notice.action!();
    expect(get(settingsStore).autoExportPath).toBe(
      "../../java/org/firstinspires/ftc/teamcode/wrong",
    );
    const java =
      "TeamCode/src/main/java/org/firstinspires/ftc/teamcode/wrong/Assets.java";
    expect(await changed()).toContain(java);
    expect(await githubRepos.readFile(at(java))).toContain(
      "package org.firstinspires.ftc.teamcode.wrong;",
    );
  });

  it("only sets the path if another project was opened meanwhile", async () => {
    settingsStore.update((s) => ({ ...s, autoExportPath: "GeneratedCode" }));
    currentFilePath.set(at(`${AUTO}/First.turt`));
    await saveProject({ quiet: true });
    const notice = get(notification)!;
    currentFilePath.set(at(`${AUTO}/Second.turt`));
    await notice.action!();
    expect(get(settingsStore).autoExportPath).toMatch(/^\.\.\/\.\.\/java\//);
    expect(
      (await githubRepos.changes(ref)).some((c) =>
        c.repoPath.endsWith("First.java"),
      ),
    ).toBe(false);
  });

  it("needs a whole class to export into a repository", async () => {
    settingsStore.update((s) => ({ ...s, autoExportFullClass: false }));
    currentFilePath.set(at(`${AUTO}/Part.turt`));
    await saveProject({ quiet: true });
    expect(get(notification)).toMatchObject({
      message: expect.stringMatching(/Generate Full Class/),
    });
  });

  it("won't save a macro from this computer into a repository project", async () => {
    currentFilePath.set(at(`${AUTO}/WithMacro.turt`));
    sequenceStore.set([
      { kind: "path", lineId: "l1" },
      {
        kind: "macro",
        id: "m1",
        name: "Score",
        filePath: "/Users/student/Score.turt",
      } as any,
    ]);
    expect(await saveProject({ quiet: true })).toBe(false);
    expect(get(notification)?.message).toMatch(/same repository/);
  });

  it("copies edited files to this device as a way out", async () => {
    const device = (globalThis as any).electronAPI;
    device.getSavedDirectory = vi.fn(async () => "/disk/paths");
    currentFilePath.set(at(`${AUTO}/Copied.turt`));
    await saveProject({ quiet: true });
    const { saveCopiesOnDevice } = await import("../../utils/github/copies");
    const { folder, count } = await saveCopiesOnDevice(ref);
    expect(folder).toBe("/disk/paths/From GitHub/team-robot");
    expect(count).toBeGreaterThan(0);
    expect(device.writeFile).toHaveBeenCalledWith(
      `/disk/paths/From GitHub/team-robot/${AUTO}/Copied.turt`,
      expect.stringContaining('"startPoint"'),
    );
  });
});
