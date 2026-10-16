// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// @vitest-environment node
// esbuild's service in its own file, so it starts here rather than in
// another test.
import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { bundle } from "./bundler.js";

let folder;
afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true });
});

describe("bundler", () => {
  it("doesn't need Node.js on the PATH", async () => {
    // Most people have no `node` to run; the packaged app has only its own.
    folder = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), "tt-bundle-")),
    );
    await fs.writeFile(
      path.join(folder, "main.ts"),
      "const n: number = 42;\nconsole.log(n);",
    );
    const pathBefore = process.env.PATH;
    process.env.PATH = "";
    try {
      const code = await bundle(folder, path.join(folder, "main.ts"), "main");
      expect(code).toContain("42");
    } finally {
      process.env.PATH = pathBefore;
    }
  });
});
