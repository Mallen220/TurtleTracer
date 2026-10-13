// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// The personal access token used to commit, and whose it is.
//
// In a browser the token is kept for this session, or remembered on this
// device for REMEMBER_DAYS if the user asks. The desktop app keeps it in its
// main process (encrypted with the system keychain when remembered) and adds
// it to GitHub requests itself, so the page, and any plugin running in it,
// never holds it.
import { writable } from "svelte/store";

const STORAGE_KEY = "turtle-tracer-github-token";

/** A remembered token is forgotten after this many days. */
export const REMEMBER_DAYS = 30;
const DAY_MS = 86_400_000;

/** What the page holds in place of the token in the desktop app. */
export const TOKEN_HELD_BY_APP = "held-by-the-desktop-app";

interface Saved {
  token: string;
  login: string | null;
  savedAt: number;
}

/** The desktop app's token storage (see electron/ipc/githubHandlers.js). */
interface DesktopTokens {
  set(
    token: string,
    remember: boolean,
    login: string | null,
  ): Promise<{ remembered: boolean }>;
  clear(): Promise<void>;
  status(): Promise<{
    hasToken: boolean;
    remembered: boolean;
    login: string | null;
  }>;
}

const desktop = (): DesktopTokens | undefined =>
  (globalThis as { electronAPI?: { githubToken?: DesktopTokens } }).electronAPI
    ?.githubToken;

function storage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return globalThis[kind] ?? null;
  } catch {
    return null; // Blocked by the browser's privacy settings.
  }
}

function readSaved(kind: "localStorage" | "sessionStorage"): Saved | null {
  const raw = storage(kind)?.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (saved && typeof saved.token === "string") return saved;
  } catch {
    // An earlier version stored the bare token.
  }
  return { token: raw, login: null, savedAt: Date.now() };
}

function loadSaved(): Saved | null {
  const session = readSaved("sessionStorage");
  if (session) return session;
  const remembered = readSaved("localStorage");
  if (remembered && Date.now() - remembered.savedAt > REMEMBER_DAYS * DAY_MS) {
    storage("localStorage")?.removeItem(STORAGE_KEY);
    return null;
  }
  return remembered;
}

function clearStored() {
  storage("localStorage")?.removeItem(STORAGE_KEY);
  storage("sessionStorage")?.removeItem(STORAGE_KEY);
}

const initial = desktop() ? null : loadSaved();
let remembered = !desktop() && !!readSaved("localStorage");

/** The token, TOKEN_HELD_BY_APP in the desktop app, or null. */
export const githubToken = writable<string | null>(initial?.token ?? null);
/** The GitHub account the token belongs to, when known. */
export const githubLogin = writable<string | null>(initial?.login ?? null);

let current = initial?.token ?? null;
githubToken.subscribe((token) => (current = token));

export const getGitHubToken = () => current;
export const isGitHubTokenRemembered = () => remembered;

/**
 * Asks the desktop app whether it kept a token from an earlier session.
 * Called once at startup; does nothing in a browser.
 */
export async function loadDesktopToken() {
  const bridge = desktop();
  if (!bridge) return;
  try {
    const status = await bridge.status();
    remembered = status.remembered;
    githubLogin.set(status.login);
    githubToken.set(status.hasToken ? TOKEN_HELD_BY_APP : null);
  } catch {
    // No token; the user can add one.
  }
}

/**
 * Keeps a token for this session, or remembers it on this device. Returns
 * whether it was remembered: the desktop app can only remember it where the
 * system keychain can protect it.
 */
export async function setGitHubToken(
  token: string,
  remember: boolean,
  login: string | null = null,
): Promise<boolean> {
  const value = token.trim();
  const bridge = desktop();
  if (bridge) {
    ({ remembered } = await bridge.set(value, remember, login));
    githubLogin.set(login);
    githubToken.set(TOKEN_HELD_BY_APP);
    return remembered;
  }
  clearStored();
  const saved: Saved = { token: value, login, savedAt: Date.now() };
  storage(remember ? "localStorage" : "sessionStorage")?.setItem(
    STORAGE_KEY,
    JSON.stringify(saved),
  );
  remembered = remember;
  githubLogin.set(login);
  githubToken.set(value);
  return remember;
}

export async function clearGitHubToken() {
  await desktop()?.clear();
  clearStored();
  remembered = false;
  githubLogin.set(null);
  githubToken.set(null);
}
