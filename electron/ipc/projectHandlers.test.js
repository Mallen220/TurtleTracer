// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findFilesUnder } from "./projectHandlers.js";

let root;
const write = async (relative, content = "") => {
  const file = path.join(root, relative);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, content);
};

beforeAll(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tt-project-"));
  await write("java/org/team/pedroPathing/Constants.java");
  await write("java/org/team/Constants.java");
  await write("java/org/team/subsystems/Drive.java");
  await write("java/org/team/PedroConstants.kt");
  await write("build/generated/Constants.java");
  await write(".idea/Constants.java");
});

afterAll(() => fs.rm(root, { recursive: true, force: true }));

describe("findFilesUnder", () => {
  it("finds files by the end of their name, skipping build and hidden folders", async () => {
    const found = await findFilesUnder(root, [
      "Constants.java",
      "Constants.kt",
    ]);
    expect(found.map((f) => path.relative(root, f)).sort()).toEqual([
      path.join("java", "org", "team", "Constants.java"),
      path.join("java", "org", "team", "PedroConstants.kt"),
      path.join("java", "org", "team", "pedroPathing", "Constants.java"),
    ]);
  });

  it("stops at the limits it is given", async () => {
    expect(
      await findFilesUnder(root, ["Constants.java"], { maxResults: 1 }),
    ).toHaveLength(1);
    expect(
      await findFilesUnder(root, ["Constants.java"], { maxDepth: 2 }),
    ).toHaveLength(0);
  });

  it("finds nothing for nothing, or for a folder that isn't there", async () => {
    expect(await findFilesUnder(root, [])).toEqual([]);
    expect(
      await findFilesUnder(path.join(root, "missing"), ["Constants.java"]),
    ).toEqual([]);
  });
});
