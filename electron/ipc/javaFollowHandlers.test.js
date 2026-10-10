// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  ipcMain: { handle: vi.fn() },
  BrowserWindow: { fromWebContents: vi.fn() },
  dialog: { showOpenDialog: vi.fn() },
}));

const { createJavaFollower } = await import("./javaFollowHandlers.js");

const FILE = "/team/TeamCode/src/main/java/Auto.java";

/** A window: what it's sent, and its "destroyed" listener. */
function windowSender(id = 1) {
  const sender = {
    id,
    sent: [],
    destroyed: false,
    onDestroyed: null,
    isDestroyed: () => sender.destroyed,
    send: (channel, ...args) => sender.sent.push([channel, ...args]),
    once: (event, listener) => {
      if (event === "destroyed") sender.onDestroyed = listener;
    },
  };
  return sender;
}

let watched;
let follower;

beforeEach(() => {
  watched = new Map();
  follower = createJavaFollower({
    watchFile: vi.fn((path, _options, listener) => watched.set(path, listener)),
    unwatchFile: vi.fn((path) => watched.delete(path)),
  });
});

const stat = (mtimeMs, size = 10) => ({ mtimeMs, size });

describe("following a Java file", () => {
  it("tells the window each time the file is saved", () => {
    const sender = windowSender();
    expect(follower.follow(sender, FILE)).toBe(true);
    watched.get(FILE)(stat(2), stat(1));
    watched.get(FILE)(stat(3), stat(2));
    expect(sender.sent).toEqual([
      ["java:changed", FILE],
      ["java:changed", FILE],
    ]);
  });

  it("stays quiet when the file hasn't changed", () => {
    const sender = windowSender();
    follower.follow(sender, FILE);
    watched.get(FILE)(stat(2), stat(2));
    expect(sender.sent).toEqual([]);
  });

  it("only follows Java files, at full paths", () => {
    const sender = windowSender();
    expect(() => follower.follow(sender, "/team/Auto.turt")).toThrow(
      "Only Java files can be followed.",
    );
    expect(() => follower.follow(sender, "Auto.java")).toThrow(
      "must be absolute",
    );
    expect(() => follower.follow(sender, "/team/../etc/x.java")).toThrow(
      "traversal",
    );
    expect(watched.size).toBe(0);
  });

  it("follows one file per window, replacing the last", () => {
    const sender = windowSender();
    follower.follow(sender, FILE);
    follower.follow(sender, "/team/Other.java");
    expect([...watched.keys()]).toEqual(["/team/Other.java"]);
  });

  it("stops when asked, and when the window closes", () => {
    const first = windowSender(1);
    const second = windowSender(2);
    follower.follow(first, FILE);
    follower.follow(second, "/team/Other.java");

    follower.stop(first);
    expect([...watched.keys()]).toEqual(["/team/Other.java"]);

    second.destroyed = true;
    second.onDestroyed();
    expect(watched.size).toBe(0);
  });

  it("doesn't send to a window that has closed", () => {
    const sender = windowSender();
    follower.follow(sender, FILE);
    sender.destroyed = true;
    watched.get(FILE)(stat(2), stat(1));
    expect(sender.sent).toEqual([]);
  });
});
