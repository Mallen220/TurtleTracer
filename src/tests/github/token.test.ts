// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { get } from "svelte/store";

const KEY = "turtle-tracer-github-token";

async function freshToken() {
  vi.resetModules();
  return import("../../utils/github/token");
}

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  delete (globalThis as { electronAPI?: unknown }).electronAPI;
});

describe("the GitHub token in a browser", () => {
  it("is kept for the session unless remembered", async () => {
    const token = await freshToken();
    await token.setGitHubToken(" pat ", false, "student");
    expect(token.getGitHubToken()).toBe("pat");
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(get(token.githubLogin)).toBe("student");
    expect(token.isGitHubTokenRemembered()).toBe(false);
  });

  it("comes back after a reload when remembered", async () => {
    const first = await freshToken();
    await first.setGitHubToken("pat", true, "student");
    sessionStorage.clear();
    const reloaded = await freshToken();
    expect(reloaded.getGitHubToken()).toBe("pat");
    expect(get(reloaded.githubLogin)).toBe("student");
    expect(reloaded.isGitHubTokenRemembered()).toBe(true);
  });

  it("forgets a remembered token after 30 days", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-01") });
    const first = await freshToken();
    await first.setGitHubToken("pat", true, "student");
    vi.setSystemTime(new Date("2026-11-02"));
    const later = await freshToken();
    expect(later.getGitHubToken()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("reads a token saved by an earlier version", async () => {
    localStorage.setItem(KEY, "old-pat");
    expect((await freshToken()).getGitHubToken()).toBe("old-pat");
  });

  it("is forgotten everywhere", async () => {
    const token = await freshToken();
    await token.setGitHubToken("pat", true, "student");
    await token.clearGitHubToken();
    expect(token.getGitHubToken()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
    expect(get(token.githubLogin)).toBeNull();
  });
});

describe("the GitHub token in the desktop app", () => {
  it("is handed to the app and never kept in the page", async () => {
    const set = vi.fn(async () => ({ remembered: true }));
    (globalThis as { electronAPI?: unknown }).electronAPI = {
      githubToken: {
        set,
        clear: vi.fn(async () => {}),
        status: vi.fn(async () => ({
          hasToken: true,
          remembered: true,
          login: "student",
        })),
      },
    };
    const token = await freshToken();
    await token.loadDesktopToken();
    expect(token.getGitHubToken()).toBe(token.TOKEN_HELD_BY_APP);
    expect(get(token.githubLogin)).toBe("student");

    await token.setGitHubToken("secret", true, "student");
    expect(set).toHaveBeenCalledWith("secret", true, "student");
    expect(token.getGitHubToken()).toBe(token.TOKEN_HELD_BY_APP);
    expect(sessionStorage.getItem(KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
