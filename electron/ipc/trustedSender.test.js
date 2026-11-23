// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { isFromApp, registerOnlyForApp } from "./trustedSender.js";

const ORIGIN = "http://localhost:17218";
const fromUrl = (url) => ({ senderFrame: { url } });

describe("isFromApp", () => {
  it("accepts the app's own page", () => {
    expect(isFromApp(fromUrl(`${ORIGIN}/`), ORIGIN)).toBe(true);
    expect(isFromApp(fromUrl(`${ORIGIN}/some/route?x=1`), ORIGIN)).toBe(true);
  });

  it.each([
    "https://example.com/",
    "http://localhost:17219/",
    "http://localhost:17218.evil.com/",
    "file:///tmp/x.html",
    "about:blank",
    "not a url",
  ])("refuses %s", (url) => {
    expect(isFromApp(fromUrl(url), ORIGIN)).toBe(false);
  });

  it("refuses a call whose frame is gone", () => {
    expect(isFromApp({ senderFrame: null }, ORIGIN)).toBe(false);
    expect(isFromApp({}, ORIGIN)).toBe(false);
  });
});

describe("registerOnlyForApp", () => {
  function setup() {
    const handlers = new Map();
    const ipcMain = { handle: (channel, fn) => handlers.set(channel, fn) };
    const original = ipcMain.handle;
    const listener = vi.fn(() => "done");
    registerOnlyForApp(
      ipcMain,
      () => ORIGIN,
      () => ipcMain.handle("file:delete", listener),
    );
    return { handlers, ipcMain, original, listener };
  }

  it("runs a handler for the app's page, passing its arguments on", () => {
    const { handlers, listener } = setup();
    const event = fromUrl(`${ORIGIN}/`);
    expect(handlers.get("file:delete")(event, "/a", 2)).toBe("done");
    expect(listener).toHaveBeenCalledWith(event, "/a", 2);
  });

  it("refuses another page without running the handler", () => {
    const { handlers, listener } = setup();
    expect(() =>
      handlers.get("file:delete")(fromUrl("https://example.com/"), "/a"),
    ).toThrow(/Refused file:delete/);
    expect(listener).not.toHaveBeenCalled();
  });

  it("puts ipcMain.handle back afterwards", () => {
    const { ipcMain, original } = setup();
    expect(ipcMain.handle).toBe(original);
  });

  it("puts it back even if registering fails", () => {
    const ipcMain = { handle: vi.fn() };
    const original = ipcMain.handle;
    expect(() =>
      registerOnlyForApp(
        ipcMain,
        () => ORIGIN,
        () => {
          throw new Error("boom");
        },
      ),
    ).toThrow("boom");
    expect(ipcMain.handle).toBe(original);
  });
});
