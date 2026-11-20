// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const handlers = vi.hoisted(() => new Map());
vi.mock("electron", () => ({
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
}));

const { registerGitHandlers, getGitStatuses } =
  await import("./gitHandlers.js");

const git = (cwd, ...args) =>
  execFileSync(
    "git",
    ["-c", "user.email=t@example.com", "-c", "user.name=t", ...args],
    { cwd, stdio: "ignore" },
  );

let dir;
beforeEach(async () => {
  handlers.clear();
  registerGitHandlers();
  // realpath: macOS reports /private/var for a folder under /var.
  dir = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), "tt-git-")));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(dir, { recursive: true, force: true });
});

describe("git status", () => {
  it("is empty outside a repository", async () => {
    expect(await getGitStatuses(dir)).toEqual({});
    expect(await handlers.get("git:status")({}, dir)).toEqual({});
  });

  it("is empty for a missing or empty directory argument", async () => {
    expect(await handlers.get("git:status")({}, "  ")).toEqual({});
    expect(await handlers.get("git:status")({}, 5)).toEqual({});
  });

  it("labels untracked, modified and staged files, and leaves clean ones out", async () => {
    git(dir, "init", "-q");
    await fs.writeFile(path.join(dir, "clean.turt"), "1");
    await fs.writeFile(path.join(dir, "edited.turt"), "1");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "first");

    await fs.writeFile(path.join(dir, "edited.turt"), "2");
    await fs.writeFile(path.join(dir, "new.turt"), "1");
    await fs.writeFile(path.join(dir, "staged.turt"), "1");
    git(dir, "add", "staged.turt");

    const statuses = await getGitStatuses(dir);
    expect(statuses[path.join(dir, "edited.turt")]).toBe("modified");
    expect(statuses[path.join(dir, "new.turt")]).toBe("untracked");
    expect(statuses[path.join(dir, "staged.turt")]).toBe("staged");
    expect(statuses[path.join(dir, "clean.turt")]).toBeUndefined();
  });
});

describe("git:show", () => {
  it("returns the committed version of a file", async () => {
    git(dir, "init", "-q");
    const file = path.join(dir, "a.turt");
    await fs.writeFile(file, "committed");
    git(dir, "add", ".");
    git(dir, "commit", "-q", "-m", "first");
    await fs.writeFile(file, "changed");

    expect(await handlers.get("git:show")({}, file)).toBe("committed");
  });

  it("is null outside a repository, and for a file that was never committed", async () => {
    const file = path.join(dir, "a.turt");
    await fs.writeFile(file, "x");
    expect(await handlers.get("git:show")({}, file)).toBeNull();

    git(dir, "init", "-q");
    expect(await handlers.get("git:show")({}, file)).toBeNull();
  });
});
