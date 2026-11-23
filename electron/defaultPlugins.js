// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { writeFileAtomic } from "./utils.js";

/** Remembers which version of each bundled plugin was last copied over. */
const MANIFEST = ".bundled-plugins.json";

const sha256 = (data) => createHash("sha256").update(data).digest("hex");

/**
 * Keeps the plugins that come with the app in the user's plugins folder.
 * A missing one is copied. One the user hasn't touched (it still matches what
 * was copied last time) is replaced by the new bundled version, so fixes
 * reach everyone. One the user edited, or that was there before this record
 * was kept, is left alone.
 */
export async function syncDefaultPlugins(sourceDir, destDir) {
  await fs.mkdir(destDir, { recursive: true });

  const manifestPath = path.join(destDir, MANIFEST);
  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));
  } catch {
    // None yet.
  }
  const before = JSON.stringify(manifest);

  const names = (await fs.readdir(sourceDir)).filter(
    (name) => name.endsWith(".js") || name.endsWith(".ts"),
  );
  for (const name of names) {
    const bundled = await fs.readFile(path.join(sourceDir, name));
    const bundledHash = sha256(bundled);
    const destFile = path.join(destDir, name);

    const current = await fs.readFile(destFile).catch(() => null);
    if (current === null) {
      await writeFileAtomic(destFile, bundled);
      manifest[name] = bundledHash;
      continue;
    }
    const currentHash = sha256(current);
    if (currentHash === bundledHash) {
      manifest[name] = bundledHash;
    } else if (manifest[name] === currentHash) {
      await writeFileAtomic(destFile, bundled);
      manifest[name] = bundledHash;
    }
  }

  if (JSON.stringify(manifest) !== before) {
    await writeFileAtomic(
      manifestPath,
      JSON.stringify(manifest, null, 2),
      "utf-8",
    );
  }
}
