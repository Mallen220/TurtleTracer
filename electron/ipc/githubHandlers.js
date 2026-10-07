// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Keeps the GitHub token in the main process and makes GitHub requests for
// the page, so the page (and any plugin running in it) never holds the
// token. A remembered token is encrypted with the system keychain.
import { app, ipcMain, safeStorage } from "electron";
import fs from "node:fs/promises";
import path from "node:path";

/** A remembered token is forgotten after this many days. */
const REMEMBER_DAYS = 30;
const DAY_MS = 86_400_000;
const TIMEOUT_MS = 60_000;

/** Response headers the page needs (content type and rate limits). */
const PASSED_HEADERS = [
  "content-type",
  "retry-after",
  "x-ratelimit-limit",
  "x-ratelimit-remaining",
  "x-ratelimit-reset",
];

/**
 * The requests the app makes: reading from the API and raw.githubusercontent.com,
 * committing through GraphQL, and starting a branch.
 */
function isAllowedRequest(url, method) {
  if (url.protocol !== "https:") return false;
  if (url.hostname === "raw.githubusercontent.com") return method === "GET";
  if (url.hostname !== "api.github.com") return false;
  if (method === "GET") {
    return url.pathname === "/user" || url.pathname.startsWith("/repos/");
  }
  if (method === "POST") {
    return (
      url.pathname === "/graphql" ||
      /^\/repos\/[^/]+\/[^/]+\/git\/refs$/.test(url.pathname)
    );
  }
  return false;
}

/**
 * The token store and request bridge, without Electron wiring, for tests.
 * `tokenFile` holds a remembered token.
 */
export function createGitHubBridge({
  keychain,
  tokenFile,
  files = fs,
  fetchImpl = (...args) => globalThis.fetch(...args),
  now = () => Date.now(),
}) {
  /** { token, login, remembered } once known; null for none. */
  let current = null;
  let loaded = false;

  async function load() {
    if (loaded) return current;
    loaded = true;
    try {
      const saved = JSON.parse(await files.readFile(tokenFile, "utf8"));
      if (now() - saved.savedAt > REMEMBER_DAYS * DAY_MS) {
        await files.rm(tokenFile, { force: true });
      } else if (keychain.isEncryptionAvailable()) {
        current = {
          token: keychain.decryptString(Buffer.from(saved.token, "base64")),
          login: saved.login ?? null,
          remembered: true,
        };
      }
    } catch {
      // No remembered token (or one this computer can't decrypt).
    }
    return current;
  }

  return {
    async status() {
      const token = await load();
      return {
        hasToken: !!token,
        remembered: !!token?.remembered,
        login: token?.login ?? null,
      };
    },

    async setToken(token, remember, login) {
      if (typeof token !== "string" || !token.trim()) {
        throw new Error("No token given");
      }
      await load();
      await files.rm(tokenFile, { force: true });
      // Only remember it where the system keychain can protect it.
      const canRemember = !!remember && keychain.isEncryptionAvailable();
      if (canRemember) {
        const encrypted = keychain.encryptString(token.trim());
        await files.mkdir(path.dirname(tokenFile), { recursive: true });
        await files.writeFile(
          tokenFile,
          JSON.stringify({
            token: Buffer.from(encrypted).toString("base64"),
            login: login ?? null,
            savedAt: now(),
          }),
          { mode: 0o600 },
        );
      }
      current = {
        token: token.trim(),
        login: login ?? null,
        remembered: canRemember,
      };
      return { remembered: canRemember };
    },

    async clearToken() {
      current = null;
      loaded = true;
      await files.rm(tokenFile, { force: true });
    },

    /** Makes a GitHub request for the page, adding the token for the API. */
    async request(rawUrl, init = {}) {
      let url;
      try {
        url = new URL(rawUrl);
      } catch {
        return { error: "That isn't a GitHub address." };
      }
      const method = (init.method ?? "GET").toUpperCase();
      if (!isAllowedRequest(url, method)) {
        return { error: "Turtle Tracer doesn't make that request to GitHub." };
      }

      const headers = {};
      for (const [name, value] of Object.entries(init.headers ?? {})) {
        if (name.toLowerCase() !== "authorization") headers[name] = value;
      }
      const token = await load();
      if (token && url.hostname === "api.github.com") {
        headers.Authorization = `Bearer ${token.token}`;
      }

      let res;
      try {
        res = await fetchImpl(url.href, {
          method,
          headers,
          body: method === "POST" ? init.body : undefined,
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (e) {
        return { error: e?.name === "TimeoutError" ? "timeout" : "network" };
      }
      const passed = {};
      for (const name of PASSED_HEADERS) {
        const value = res.headers.get(name);
        if (value !== null) passed[name] = value;
      }
      return { status: res.status, headers: passed, body: await res.text() };
    },
  };
}

export function registerGitHubHandlers() {
  const bridge = createGitHubBridge({
    keychain: safeStorage,
    tokenFile: path.join(app.getPath("userData"), "github-token.json"),
  });
  ipcMain.handle("github:token-status", () => bridge.status());
  ipcMain.handle("github:token-set", (_event, token, remember, login) =>
    bridge.setToken(token, remember, login),
  );
  ipcMain.handle("github:token-clear", () => bridge.clearToken());
  ipcMain.handle("github:fetch", (_event, url, init) =>
    bridge.request(url, init),
  );
}
