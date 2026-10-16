// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Installing a plugin someone gave the user, from a folder or a .zip.
import crypto from "node:crypto";
import { createWriteStream } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";
import { isInside } from "./files.js";
import { validateManifest } from "./manifest.js";

/** Limits on what an install may contain. */
export const INSTALL_LIMITS = { files: 5000, bytes: 300 * 1024 * 1024 };

/** Reads and checks the manifest in a folder that may be named anything. */
async function manifestIn(folder) {
  let data;
  try {
    data = JSON.parse(
      await fs.readFile(path.join(folder, "plugin.json"), "utf8"),
    );
  } catch {
    throw new Error("That doesn't contain a plugin: there's no plugin.json.");
  }
  const result = validateManifest(data, data?.id);
  if ("error" in result) throw new Error(result.error);
  return result.manifest;
}

/**
 * Copies plain files and folders only, so a symbolic link can't point the
 * installed plugin at something outside it.
 */
async function copyPlain(source, dest, counter) {
  await fs.mkdir(dest, { recursive: true });
  for (const entry of await fs.readdir(source, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const from = path.join(source, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      await copyPlain(from, to, counter);
    } else if (entry.isFile()) {
      counter.files += 1;
      counter.bytes += (await fs.stat(from)).size;
      if (
        counter.files > INSTALL_LIMITS.files ||
        counter.bytes > INSTALL_LIMITS.bytes
      ) {
        throw new Error("That plugin is too big to install.");
      }
      await fs.copyFile(from, to);
    }
  }
}

/**
 * Installs the plugin in `source` into the plugins folder, replacing any
 * plugin with the same id once `confirmReplace` agrees.
 * @param {string} pluginsDir
 * @param {string} source
 * @param {(manifest: object) => Promise<boolean>} confirmReplace
 * @returns {Promise<{ id: string } | null>} null if the user said no.
 */
export async function installFromFolder(pluginsDir, source, confirmReplace) {
  const manifest = await manifestIn(source);
  const dest = path.join(pluginsDir, manifest.id);
  const realPlugins = await fs.realpath(pluginsDir);
  if (
    isInside(path.join(realPlugins, manifest.id), await fs.realpath(source))
  ) {
    throw new Error("That plugin is already in the plugins folder.");
  }

  const exists = await fs
    .access(dest)
    .then(() => true)
    .catch(() => false);
  if (exists && !(await confirmReplace(manifest))) return null;

  const staging = path.join(
    pluginsDir,
    `.installing-${crypto.randomBytes(4).toString("hex")}`,
  );
  try {
    await copyPlain(source, staging, { files: 0, bytes: 0 });
    await fs.rm(dest, { recursive: true, force: true });
    await fs.rename(staging, dest);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
  return { id: manifest.id };
}

function openZip(file) {
  return new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true }, (err, zip) =>
      err ? reject(err) : resolve(zip),
    ),
  );
}

const asError = (e) => (e instanceof Error ? e : new Error(String(e)));

/** Whether a zip entry is a symbolic link (Unix mode in the high bits). */
function isSymlink(entry) {
  return ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000;
}

/**
 * Unpacks a zip into `dest`. yauzl refuses absolute and `..` paths; links
 * are skipped and the size is limited.
 */
export async function unzip(file, dest) {
  const zip = await openZip(file);
  let files = 0;
  let bytes = 0;
  await new Promise((resolve, reject) => {
    zip.on("error", reject);
    zip.on("end", resolve);
    zip.on("entry", (entry) => {
      const target = path.join(dest, ...entry.fileName.split("/"));
      if (!isInside(dest, target)) {
        reject(new Error(`The zip contains a bad path: ${entry.fileName}`));
        return;
      }
      if (entry.fileName.endsWith("/") || isSymlink(entry)) {
        zip.readEntry();
        return;
      }
      files += 1;
      bytes += entry.uncompressedSize;
      if (files > INSTALL_LIMITS.files || bytes > INSTALL_LIMITS.bytes) {
        reject(new Error("That plugin is too big to install."));
        return;
      }
      zip.openReadStream(entry, async (err, stream) => {
        if (err) return reject(asError(err));
        try {
          await fs.mkdir(path.dirname(target), { recursive: true });
          await pipeline(stream, createWriteStream(target));
          zip.readEntry();
        } catch (e) {
          reject(asError(e));
        }
      });
    });
    zip.readEntry();
  }).finally(() => zip.close());
}

/**
 * Installs a plugin from a .zip. The manifest may be at the top of the zip
 * or inside a single folder (as GitHub's "Download ZIP" makes them).
 */
export async function installFromZip(pluginsDir, file, confirmReplace) {
  const temp = path.join(
    pluginsDir,
    `.unzipping-${crypto.randomBytes(4).toString("hex")}`,
  );
  try {
    await unzip(file, temp);
    let root = temp;
    const top = await fs.readdir(temp, { withFileTypes: true });
    const hasManifest = top.some((e) => e.name === "plugin.json");
    if (!hasManifest && top.length === 1 && top[0].isDirectory()) {
      root = path.join(temp, top[0].name);
    }
    return await installFromFolder(pluginsDir, root, confirmReplace);
  } finally {
    await fs.rm(temp, { recursive: true, force: true });
  }
}
