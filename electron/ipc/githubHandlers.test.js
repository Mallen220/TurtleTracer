// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: vi.fn(() => "/mock/userData") },
  ipcMain: { handle: vi.fn() },
  safeStorage: {},
}));

const { createGitHubBridge } = await import("./githubHandlers.js");

/** An in-memory folder standing in for the app's data folder. */
function memoryFiles() {
  const files = new Map();
  return {
    files,
    readFile: async (p) => {
      if (!files.has(p)) throw new Error("ENOENT");
      return files.get(p);
    },
    writeFile: async (p, text) => void files.set(p, text),
    rm: async (p) => void files.delete(p),
    mkdir: async () => {},
  };
}

const keychain = (available = true) => ({
  isEncryptionAvailable: () => available,
  encryptString: (text) => Buffer.from(`encrypted:${text}`),
  decryptString: (buffer) => buffer.toString().replace(/^encrypted:/, ""),
});

function respond(status = 200, body = "{}", headers = {}) {
  return vi.fn(async () => new Response(body, { status, headers }));
}

const TOKEN_FILE = "/data/github-token.json";
let files;

beforeEach(() => {
  files = memoryFiles();
});

describe("the desktop app's GitHub token", () => {
  it("remembers a token encrypted with the system keychain", async () => {
    const bridge = createGitHubBridge({
      keychain: keychain(),
      tokenFile: TOKEN_FILE,
      files,
    });
    expect(await bridge.setToken(" secret ", true, "student")).toEqual({
      remembered: true,
    });
    const saved = files.files.get(TOKEN_FILE);
    expect(saved).not.toContain("secret");
    expect(JSON.parse(saved).login).toBe("student");

    // The next launch reads it back.
    const later = createGitHubBridge({
      keychain: keychain(),
      tokenFile: TOKEN_FILE,
      files,
    });
    expect(await later.status()).toEqual({
      hasToken: true,
      remembered: true,
      login: "student",
    });
  });

  it("only keeps it for the session when there's no keychain to protect it", async () => {
    const bridge = createGitHubBridge({
      keychain: keychain(false),
      tokenFile: TOKEN_FILE,
      files,
    });
    expect(await bridge.setToken("secret", true, "student")).toEqual({
      remembered: false,
    });
    expect(files.files.size).toBe(0);
    expect((await bridge.status()).hasToken).toBe(true);
  });

  it("forgets a remembered token after 30 days", async () => {
    let time = 0;
    const make = () =>
      createGitHubBridge({
        keychain: keychain(),
        tokenFile: TOKEN_FILE,
        files,
        now: () => time,
      });
    await make().setToken("secret", true, "student");
    time = 31 * 86_400_000;
    expect((await make().status()).hasToken).toBe(false);
    expect(files.files.size).toBe(0);
  });

  it("removes the token", async () => {
    const bridge = createGitHubBridge({
      keychain: keychain(),
      tokenFile: TOKEN_FILE,
      files,
    });
    await bridge.setToken("secret", true, "student");
    await bridge.clearToken();
    expect((await bridge.status()).hasToken).toBe(false);
    expect(files.files.size).toBe(0);
  });
});

describe("GitHub requests made for the page", () => {
  async function bridgeWith(fetchImpl) {
    const bridge = createGitHubBridge({
      keychain: keychain(),
      tokenFile: TOKEN_FILE,
      files,
      fetchImpl,
    });
    await bridge.setToken("secret", false, "student");
    return bridge;
  }

  it("adds the token to API requests and never shows it to the page", async () => {
    const fetchImpl = respond(200, '{"login":"student"}', {
      "content-type": "application/json",
      "x-ratelimit-remaining": "4999",
      "set-cookie": "nope",
    });
    const bridge = await bridgeWith(fetchImpl);
    const res = await bridge.request("https://api.github.com/user", {
      headers: { Accept: "application/vnd.github+json" },
    });
    expect(res).toEqual({
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-ratelimit-remaining": "4999",
      },
      body: '{"login":"student"}',
    });
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({
      Accept: "application/vnd.github+json",
      Authorization: "Bearer secret",
    });
  });

  it("ignores a token the page tries to send, and doesn't send ours to file downloads", async () => {
    const fetchImpl = respond(200, "file");
    const bridge = await bridgeWith(fetchImpl);
    await bridge.request("https://raw.githubusercontent.com/t/r/abc/a.turt", {
      headers: { Authorization: "Bearer stolen" },
    });
    expect(fetchImpl.mock.calls[0][1].headers).toEqual({});
  });

  it("only makes the requests the app needs", async () => {
    const fetchImpl = respond();
    const bridge = await bridgeWith(fetchImpl);
    for (const [url, method] of [
      ["https://evil.example.com/collect", "GET"],
      ["http://api.github.com/user", "GET"],
      ["https://api.github.com/repos/t/r", "DELETE"],
      ["https://api.github.com/user/repos", "POST"],
      ["https://api.github.com/repos/t/r/hooks", "POST"],
      ["https://raw.githubusercontent.com/t/r/abc/a.turt", "POST"],
      ["not a url", "GET"],
    ]) {
      expect(
        await bridge.request(url, { method }),
        `${method} ${url}`,
      ).toHaveProperty("error");
    }
    expect(fetchImpl).not.toHaveBeenCalled();

    for (const [url, method] of [
      ["https://api.github.com/graphql", "POST"],
      ["https://api.github.com/repos/t/r/git/refs", "POST"],
      ["https://api.github.com/repos/t/r/git/trees/abc?recursive=1", "GET"],
    ]) {
      expect(
        await bridge.request(url, { method }),
        `${method} ${url}`,
      ).toHaveProperty("status", 200);
    }
  });

  it("reports a request that couldn't be made", async () => {
    const bridge = await bridgeWith(
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    expect(await bridge.request("https://api.github.com/user")).toEqual({
      error: "network",
    });
  });
});
