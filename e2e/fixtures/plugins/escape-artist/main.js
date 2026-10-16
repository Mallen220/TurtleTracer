// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Tries every way out of the plugin sandbox and records what happened in
// globalThis.escapeResults (and the plugin's log). Every one must be blocked.
const results = {};

async function attempt(name, escape) {
  try {
    const value = await escape();
    results[name] = `ALLOWED ${String(value).slice(0, 60)}`;
  } catch (error) {
    results[name] = `blocked (${String(error?.name ?? error).slice(0, 40)})`;
  }
}

/** Resolves with what a worker's fetch did; workers get their own CSP. */
function fetchFromWorker() {
  const source = `fetch("https://example.com").then(
    () => postMessage("fetched"),
    () => postMessage("blocked"),
  );`;
  const url = URL.createObjectURL(
    new Blob([source], { type: "text/javascript" }),
  );
  return new Promise((resolve, reject) => {
    const worker = new Worker(url);
    worker.addEventListener("message", (event) =>
      event.data === "fetched"
        ? resolve("worker fetched")
        : reject(new Error("worker blocked")),
    );
    worker.addEventListener("error", () => reject(new Error("no worker")));
    setTimeout(() => reject(new Error("timeout")), 3000);
  });
}

async function tryEverything() {
  await attempt("fetch the internet", () =>
    fetch("https://example.com").then((r) => r.status),
  );
  await attempt("fetch the app", () =>
    fetch("http://localhost:17218/").then((r) => r.status),
  );
  await attempt("localStorage", () => {
    localStorage.setItem("x", "1");
    return localStorage.getItem("x");
  });
  await attempt(
    "indexedDB",
    () =>
      new Promise((resolve, reject) => {
        const request = indexedDB.open("escape");
        request.addEventListener("success", () => resolve("opened"));
        request.addEventListener("error", () => reject(request.error));
      }),
  );
  await attempt("cookie", () => {
    document.cookie = "escaped=1";
    if (!document.cookie) throw new Error("no cookie");
    return document.cookie;
  });
  await attempt("parent document", () => parent.document.title);
  await attempt("top location", () => top.location.href);
  await attempt("electronAPI", () => {
    const api = globalThis.electronAPI ?? parent.electronAPI;
    if (!api) throw new Error("none");
    return "present";
  });
  await attempt("node", () => {
    // Off globalThis: esbuild swaps a bare `require` for its own stand-in.
    if (!globalThis.require && !globalThis.process) throw new Error("none");
    return "present";
  });
  await attempt("open a window", () => {
    if (!globalThis.open("https://example.com")) throw new Error("null");
    return "opened";
  });
  await attempt("remote import", () => import("https://esm.sh/lodash"));
  await attempt("worker fetch", fetchFromWorker);
  await attempt("navigate the app", () => {
    top.location.href = "https://example.com";
    return "navigated";
  });
  globalThis.escapeResults = results;
  console.log(`RESULTS ${JSON.stringify(results)}`);
}

// A plugin's main script is a classic script, so no top-level await.
// eslint-disable-next-line unicorn/prefer-top-level-await
tryEverything();
