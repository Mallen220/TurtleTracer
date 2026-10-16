// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Installs the npm packages a plugin lists in its manifest, once the user
// has agreed to it. Packages come only from registry.npmjs.org, every
// tarball is checked against the registry's integrity hash, and no install
// scripts are ever run: the files are just unpacked. The code then runs
// inside the plugin's sandbox like the rest of the plugin.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import semver from "semver";
import tar from "tar";

export const REGISTRY = "https://registry.npmjs.org/";
export const LOCK_FILE = "turtle-lock.json";

/** Limits that stop a plugin pulling in an unreasonable amount. */
export const LIMITS = {
  packages: 200,
  /** Total size of the downloaded tarballs. */
  downloadBytes: 150 * 1024 * 1024,
};

/**
 * Whether a plugin's packages are installed as its manifest asks: the lock
 * file records the same dependencies and `node_modules` exists.
 * @param {string} folder
 * @param {Record<string, string> | undefined} dependencies
 */
export async function dependenciesInstalled(folder, dependencies) {
  if (!dependencies || Object.keys(dependencies).length === 0) return true;
  try {
    const lock = JSON.parse(
      await fs.readFile(path.join(folder, LOCK_FILE), "utf8"),
    );
    await fs.access(path.join(folder, "node_modules"));
    return sameDependencies(lock.dependencies, dependencies);
  } catch {
    return false;
  }
}

function sameDependencies(a, b) {
  const keys = Object.keys(a ?? {});
  return (
    keys.length === Object.keys(b).length && keys.every((k) => a[k] === b[k])
  );
}

/**
 * Picks a version of each package and where it goes in node_modules. A
 * package goes at the top level unless a different version is already
 * there, in which case it's nested under the package that needs it.
 * @param {Record<string, string>} dependencies
 * @param {(name: string) => Promise<any>} getPackument
 */
export async function resolvePackages(dependencies, getPackument) {
  /** @type {Map<string, {name: string, version: string, tarball: string, integrity: string, dependencies: Record<string, string>}>} */
  const placed = new Map(); // install path → package
  const packuments = new Map();
  const queue = Object.entries(dependencies).map(([name, range]) => ({
    name,
    range,
    parentPath: "",
  }));

  while (queue.length > 0) {
    const { name, range, parentPath } = queue.shift();
    if (!packuments.has(name)) packuments.set(name, await getPackument(name));
    const packument = packuments.get(name);
    const version = semver.maxSatisfying(
      Object.keys(packument.versions ?? {}),
      range,
    );
    if (!version) {
      throw new Error(`No version of ${name} matches "${range}".`);
    }

    // Reuse a copy that's already visible from here and satisfies the range.
    const visible = visibleInstall(placed, parentPath, name);
    if (visible && semver.satisfies(placed.get(visible).version, range)) {
      continue;
    }
    const topPath = `node_modules/${name}`;
    const installPath = placed.has(topPath)
      ? `${parentPath}/node_modules/${name}`
      : topPath;
    if (placed.has(installPath)) continue;

    const info = packument.versions[version];
    const dist = info.dist ?? {};
    if (!dist.tarball?.startsWith(REGISTRY)) {
      throw new Error(`${name}@${version} isn't hosted on the npm registry.`);
    }
    if (!dist.integrity?.startsWith("sha512-")) {
      throw new Error(`${name}@${version} has no sha512 integrity hash.`);
    }
    placed.set(installPath, {
      name,
      version,
      tarball: dist.tarball,
      integrity: dist.integrity,
      dependencies: info.dependencies ?? {},
    });
    if (placed.size > LIMITS.packages) {
      throw new Error(
        `This plugin needs more than ${LIMITS.packages} packages, which is more than Turtle Tracer allows.`,
      );
    }
    for (const [dep, depRange] of Object.entries(info.dependencies ?? {})) {
      queue.push({ name: dep, range: depRange, parentPath: installPath });
    }
  }
  return placed;
}

/** The install path Node would find `name` at when required from `fromPath`. */
function visibleInstall(placed, fromPath, name) {
  let dir = fromPath;
  while (dir) {
    const candidate = `${dir}/node_modules/${name}`;
    if (placed.has(candidate)) return candidate;
    const parent = dir.lastIndexOf("/node_modules/");
    dir = parent === -1 ? "" : dir.slice(0, parent);
  }
  const top = `node_modules/${name}`;
  return placed.has(top) ? top : null;
}

/** Checks a tarball against an npm `sha512-<base64>` integrity string. */
export function checkIntegrity(buffer, integrity) {
  const expected = integrity.slice("sha512-".length);
  const actual = crypto.createHash("sha512").update(buffer).digest("base64");
  return actual === expected;
}

/**
 * Unpacks a package tarball into `dest`. Only plain files and folders are
 * written; links are skipped, and tar already refuses paths that would land
 * outside `dest`.
 */
export async function unpack(buffer, dest) {
  await fs.mkdir(dest, { recursive: true });
  await pipeline(
    Readable.from(buffer),
    tar.x({
      cwd: dest,
      strip: 1,
      filter: (_path, entry) =>
        entry.type === "File" ||
        entry.type === "OldFile" ||
        entry.type === "Directory",
    }),
  );
}

/**
 * Downloads and unpacks a plugin's packages into its node_modules folder,
 * replacing what was there only once everything has succeeded.
 * @param {string} folder The plugin's folder.
 * @param {Record<string, string>} dependencies From the manifest.
 * @param {{ fetch?: typeof fetch, onProgress?: (done: number, total: number) => void }} [options]
 * @returns {Promise<{ name: string, version: string }[]>} What was installed.
 */
export async function installDependencies(folder, dependencies, options = {}) {
  const fetchImpl = options.fetch ?? fetch;

  async function getPackument(name) {
    const res = await fetchImpl(`${REGISTRY}${name.replace("/", "%2f")}`, {
      headers: { Accept: "application/vnd.npm.install-v1+json" },
    });
    if (!res.ok)
      throw new Error(`Couldn't find ${name} on npm (${res.status}).`);
    return res.json();
  }

  const placed = await resolvePackages(dependencies, getPackument);
  const staging = path.join(folder, "node_modules.installing");
  await fs.rm(staging, { recursive: true, force: true });

  let downloaded = 0;
  let done = 0;
  try {
    for (const [installPath, pkg] of placed) {
      const res = await fetchImpl(pkg.tarball);
      if (!res.ok) {
        throw new Error(`Couldn't download ${pkg.name} (${res.status}).`);
      }
      const buffer = Buffer.from(await res.arrayBuffer());
      downloaded += buffer.length;
      if (downloaded > LIMITS.downloadBytes) {
        throw new Error("This plugin's packages are too big to download.");
      }
      if (!checkIntegrity(buffer, pkg.integrity)) {
        throw new Error(
          `${pkg.name}@${pkg.version} doesn't match the registry's integrity hash, so it wasn't installed.`,
        );
      }
      const relative = installPath.slice("node_modules/".length);
      await unpack(buffer, path.join(staging, ...relative.split("/")));
      options.onProgress?.(++done, placed.size);
    }

    const target = path.join(folder, "node_modules");
    await fs.rm(target, { recursive: true, force: true });
    await fs.rename(staging, target);
  } catch (e) {
    await fs.rm(staging, { recursive: true, force: true });
    throw e;
  }

  const packages = [...placed].map(([installPath, pkg]) => ({
    path: installPath,
    name: pkg.name,
    version: pkg.version,
    integrity: pkg.integrity,
  }));
  await fs.writeFile(
    path.join(folder, LOCK_FILE),
    JSON.stringify({ dependencies, packages }, null, 2),
  );
  return packages.map(({ name, version }) => ({ name, version }));
}
