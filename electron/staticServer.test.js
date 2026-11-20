// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createStaticHandler } from "./staticServer.js";

let dir;
let server;
let base;

beforeAll(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-static-"));
  const dist = path.join(dir, "dist");
  await fs.mkdir(path.join(dist, "assets"), { recursive: true });
  await fs.writeFile(path.join(dist, "index.html"), "<p>app</p>");
  await fs.writeFile(path.join(dist, "assets", "app.js"), "export {}");
  await fs.writeFile(path.join(dist, "assets", "font.woff2"), "font");
  await fs.writeFile(path.join(dist, ".DS_Store"), "junk");
  await fs.writeFile(path.join(dir, "secret.txt"), "secret");

  server = http.createServer(createStaticHandler(dist));
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(dir, { recursive: true, force: true });
});

// fetch() tidies "../" out of an address, so these go out as raw requests.
function rawGet(requestPath) {
  return new Promise((resolve, reject) => {
    const { port } = server.address();
    const req = http.request(
      { host: "127.0.0.1", port, path: requestPath, method: "GET" },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => resolve({ status: res.statusCode, body }));
      },
    );
    req.on("error", reject);
    req.end();
  });
}

describe("static server", () => {
  it("serves index.html at the root", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toBe("<p>app</p>");
  });

  it("serves scripts as JavaScript, which module loading requires", async () => {
    const res = await fetch(`${base}/assets/app.js`);
    expect(res.headers.get("content-type")).toContain("text/javascript");
    expect(await res.text()).toBe("export {}");
  });

  it("knows font types", async () => {
    const res = await fetch(`${base}/assets/font.woff2`);
    expect(res.headers.get("content-type")).toBe("font/woff2");
  });

  it("gives a page route with no extension the app", async () => {
    const res = await fetch(`${base}/some/route`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("<p>app</p>");
  });

  it("says 404 for a missing file that has an extension", async () => {
    expect((await fetch(`${base}/assets/missing.js`)).status).toBe(404);
  });

  it("answers 304 when the browser's copy is current", async () => {
    const first = await fetch(`${base}/assets/app.js`);
    const second = await fetch(`${base}/assets/app.js`, {
      headers: { "If-None-Match": first.headers.get("etag") },
    });
    expect(second.status).toBe(304);
  });

  it("answers HEAD without a body", async () => {
    const res = await fetch(`${base}/assets/app.js`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe("9");
    expect(await res.text()).toBe("");
  });

  it("refuses other methods", async () => {
    const res = await fetch(`${base}/`, { method: "POST", body: "x" });
    expect(res.status).toBe(405);
  });

  it("doesn't serve hidden files", async () => {
    expect((await fetch(`${base}/.DS_Store`)).status).toBe(404);
  });

  it.each([
    "/../secret.txt",
    "/%2e%2e/secret.txt",
    "/assets/../../secret.txt",
    "/..%2fsecret.txt",
    "/%2e%2e%2fsecret.txt",
  ])("never leaves the app folder (%s)", async (requestPath) => {
    const res = await rawGet(requestPath);
    expect(res.body).not.toContain("secret");
  });

  it("rejects a malformed address", async () => {
    expect((await rawGet("/%E0%A4%A")).status).toBe(400);
  });
});
