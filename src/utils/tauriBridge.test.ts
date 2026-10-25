// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearMocks, mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { emit } from "@tauri-apps/api/event";
import {
  createTauriBridge,
  importLegacyWebStorage,
  installDesktopGuards,
  isBlockedShortcut,
} from "./tauriBridge";

type Call = { cmd: string; args: Record<string, unknown> | undefined };

let calls: Call[];
let replies: Record<string, unknown>;

beforeEach(() => {
  calls = [];
  replies = {};
  mockWindows("main-0");
  mockIPC(
    (cmd, args) => {
      calls.push({ cmd, args: args as Record<string, unknown> });
      return replies[cmd];
    },
    { shouldMockEvents: true },
  );
});

afterEach(() => {
  clearMocks();
  localStorage.clear();
});

describe("the desktop bridge", () => {
  it("sends each call to the Rust command that replaced its IPC channel", async () => {
    const api = createTauriBridge();
    await api.readFile("/a/b.turt");
    await api.writeFile("/a/b.turt", "{}");
    await api.renameFile?.("/a/b.turt", "/a/c.turt");
    await api.findFiles?.("/team", ["Constants.java"], { maxDepth: 3 });
    await api.githubFetch?.("https://api.github.com/user", {
      method: "GET",
      headers: {},
    });
    await api.telemetry?.connect("192.168.43.1", "8000" as never, "tcp");

    expect(calls).toEqual([
      { cmd: "file_read", args: { filePath: "/a/b.turt" } },
      { cmd: "file_write", args: { filePath: "/a/b.turt", content: "{}" } },
      {
        cmd: "file_rename",
        args: { oldPath: "/a/b.turt", newPath: "/a/c.turt" },
      },
      {
        cmd: "project_find_files",
        args: {
          root: "/team",
          endings: ["Constants.java"],
          options: { maxDepth: 3 },
        },
      },
      {
        cmd: "github_fetch",
        args: {
          url: "https://api.github.com/user",
          init: { method: "GET", headers: {} },
        },
      },
      {
        cmd: "telemetry_connect",
        args: { ip: "192.168.43.1", port: 8000, protocol: "tcp" },
      },
    ]);
  });

  it("turns modification times back into dates", async () => {
    replies.file_list = [
      {
        name: "a.turt",
        path: "/d/a.turt",
        size: 2,
        modified: 1_700_000_000_000,
        gitStatus: "clean",
        isDirectory: false,
      },
    ];
    replies.file_get_directory_stats = {
      totalFiles: 1,
      totalSize: 2,
      lastModified: 1_700_000_000_000,
    };
    const api = createTauriBridge();

    const [file] = await api.listFiles("/d");
    expect(file.modified).toBeInstanceOf(Date);
    expect(file.modified.getTime()).toBe(1_700_000_000_000);

    const stats = await api.getDirectoryStats?.("/d");
    expect(stats.lastModified).toEqual(new Date(1_700_000_000_000));
  });

  it("passes events sent to the window on to the page", async () => {
    const api = createTauriBridge();
    const menu = vi.fn();
    const java = vi.fn();
    api.onMenuAction?.(menu);
    const stop = api.onJavaFileChanged?.(java);
    await new Promise((r) => setTimeout(r, 0));

    await emit("menu-action", "save-project");
    await emit("java:changed", "/team/Auto.java");
    await vi.waitFor(() => expect(menu).toHaveBeenCalledWith("save-project"));
    expect(java).toHaveBeenCalledWith("/team/Auto.java");

    stop?.();
    await new Promise((r) => setTimeout(r, 0));
    await emit("java:changed", "/team/Auto.java");
    expect(java).toHaveBeenCalledTimes(1);
  });

  it("says the page is ready only once its listeners are set up", async () => {
    const api = createTauriBridge();
    const opened = vi.fn();
    api.onOpenFilePath?.(opened);
    replies.renderer_ready = true;
    await api.rendererReady?.();
    const order = calls.map((c) => c.cmd);
    expect(order.at(-1)).toBe("renderer_ready");
    await emit("open-file-path", "/a/b.turt");
    await vi.waitFor(() => expect(opened).toHaveBeenCalledWith("/a/b.turt"));
  });

  it("transpiles TypeScript plugins in the page", async () => {
    const api = createTauriBridge();
    const out = await api.transpilePlugin?.("const n: number = 1;");
    expect(out).toContain("const n = 1;");
    expect(out).not.toContain(": number");
  });
});

describe("shortcuts that would lose work", () => {
  const key = (init: KeyboardEventInit) => new KeyboardEvent("keydown", init);

  it("blocks reload, close and devtools keys, and nothing else", () => {
    const mod = /Mac/.test(navigator.platform) ? "metaKey" : "ctrlKey";
    expect(isBlockedShortcut(key({ key: "r", [mod]: true }))).toBe(true);
    expect(
      isBlockedShortcut(key({ key: "R", [mod]: true, shiftKey: true })),
    ).toBe(true);
    expect(isBlockedShortcut(key({ key: "F5" }))).toBe(true);
    expect(isBlockedShortcut(key({ key: "w", [mod]: true }))).toBe(true);
    expect(isBlockedShortcut(key({ key: "F4", ctrlKey: true }))).toBe(true);
    expect(
      isBlockedShortcut(key({ key: "I", [mod]: true, shiftKey: true })),
    ).toBe(true);
    expect(isBlockedShortcut(key({ key: "r" }))).toBe(false);
    expect(isBlockedShortcut(key({ key: "s", [mod]: true }))).toBe(false);
  });

  it("keeps the webview's own menu to text fields", () => {
    installDesktopGuards();
    const div = document.createElement("div");
    const input = document.createElement("input");
    document.body.append(div, input);
    const menuOn = (el: Element) => {
      const e = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(e);
      return e.defaultPrevented;
    };
    expect(menuOn(div)).toBe(true);
    expect(menuOn(input)).toBe(false);

    const reload = new KeyboardEvent("keydown", {
      key: "F5",
      bubbles: true,
      cancelable: true,
    });
    div.dispatchEvent(reload);
    expect(reload.defaultPrevented).toBe(true);
    div.remove();
    input.remove();
  });
});

describe("bringing localStorage over from the Electron app", () => {
  it("fills in what the page doesn't have yet, once", async () => {
    localStorage.setItem("kept", "new");
    replies.take_legacy_web_storage = {
      storage: { "robot-profiles": "[1]", kept: "old" },
      notice: "Please sign in to GitHub again.",
    };

    await expect(importLegacyWebStorage()).resolves.toBe(
      "Please sign in to GitHub again.",
    );
    expect(localStorage.getItem("robot-profiles")).toBe("[1]");
    expect(localStorage.getItem("kept")).toBe("new");
    expect(calls.map((c) => c.cmd)).toEqual([
      "take_legacy_web_storage",
      "finish_legacy_migration",
    ]);
  });

  it("does nothing after the first time", async () => {
    replies.take_legacy_web_storage = null;
    await expect(importLegacyWebStorage()).resolves.toBeNull();
    expect(calls.map((c) => c.cmd)).toEqual(["take_legacy_web_storage"]);
  });
});
