// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import tar from "tar";
import {
  REGISTRY,
  dependenciesInstalled,
  installDependencies,
  resolvePackages,
} from "./packages.js";

let root;
beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "tt-packages-"));
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

/** A package tarball like npm's: files under package/. */
async function tarball(files) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-tarball-"));
  for (const [name, contents] of Object.entries(files)) {
    const file = path.join(dir, "package", name);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, contents);
  }
  const out = path.join(dir, "pkg.tgz");
  await tar.c({ gzip: true, file: out, cwd: dir }, ["package"]);
  const buffer = await fs.readFile(out);
  await fs.rm(dir, { recursive: true, force: true });
  return buffer;
}

const integrity = (buffer) =>
  `sha512-${crypto.createHash("sha512").update(buffer).digest("base64")}`;

/** A fake registry: packuments and tarballs from `packages`. */
function registry(packages) {
  const requests = [];
  const fetch = async (url) => {
    requests.push(url);
    for (const [name, versions] of Object.entries(packages)) {
      if (url === `${REGISTRY}${name.replace("/", "%2f")}`) {
        return Response.json({
          versions: Object.fromEntries(
            Object.entries(versions).map(([version, info]) => [
              version,
              {
                dependencies: info.dependencies,
                dist: {
                  tarball:
                    info.tarballUrl ?? `${REGISTRY}${name}/-/${version}.tgz`,
                  integrity: info.integrity ?? integrity(info.buffer),
                },
              },
            ]),
          ),
        });
      }
      for (const [version, info] of Object.entries(versions)) {
        if (url === `${REGISTRY}${name}/-/${version}.tgz`)
          return new Response(info.buffer);
      }
    }
    return new Response("not found", { status: 404 });
  };
  return { fetch, requests };
}

describe("installing a plugin's packages", () => {
  it("downloads, checks and unpacks packages and what they need", async () => {
    const a = await tarball({
      "package.json": '{"name":"a"}',
      "index.js": "export default 1;",
    });
    const b1 = await tarball({
      "package.json": '{"name":"b","version":"1.0.0"}',
    });
    const b2 = await tarball({
      "package.json": '{"name":"b","version":"2.0.0"}',
    });
    const { fetch } = registry({
      a: { "1.0.0": { buffer: a, dependencies: { b: "^2.0.0" } } },
      b: { "1.0.0": { buffer: b1 }, "2.0.0": { buffer: b2 } },
    });
    const installed = await installDependencies(
      root,
      { a: "1.0.0", b: "1.0.0" },
      { fetch },
    );
    expect(installed).toEqual([
      { name: "a", version: "1.0.0" },
      { name: "b", version: "1.0.0" },
      { name: "b", version: "2.0.0" },
    ]);
    // a needs b 2, but b 1 is at the top level, so b 2 goes under a.
    const nested = await fs.readFile(
      path.join(root, "node_modules/a/node_modules/b/package.json"),
      "utf8",
    );
    expect(JSON.parse(nested).version).toBe("2.0.0");
    expect(await dependenciesInstalled(root, { a: "1.0.0", b: "1.0.0" })).toBe(
      true,
    );
    expect(await dependenciesInstalled(root, { a: "2.0.0" })).toBe(false);
  });

  it("refuses a tarball that doesn't match its integrity hash, keeping what was there", async () => {
    const good = await tarball({ "index.js": "1" });
    const { fetch } = registry({
      a: {
        "1.0.0": { buffer: good, integrity: integrity(Buffer.from("other")) },
      },
    });
    await fs.mkdir(path.join(root, "node_modules/kept"), { recursive: true });
    await expect(
      installDependencies(root, { a: "1.0.0" }, { fetch }),
    ).rejects.toThrow(/integrity/);
    await expect(
      fs.access(path.join(root, "node_modules/kept")),
    ).resolves.toBeUndefined();
    await expect(
      fs.access(path.join(root, "node_modules.installing")),
    ).rejects.toThrow();
  });

  it("only takes packages from the npm registry", async () => {
    const buffer = await tarball({ "index.js": "1" });
    const { fetch } = registry({
      a: { "1.0.0": { buffer, tarballUrl: "https://evil.example/a.tgz" } },
    });
    await expect(
      installDependencies(root, { a: "1.0.0" }, { fetch }),
    ).rejects.toThrow(/isn't hosted on the npm registry/);
  });

  it("says when no version matches", async () => {
    const buffer = await tarball({ "index.js": "1" });
    const { fetch } = registry({ a: { "1.0.0": { buffer } } });
    await expect(
      resolvePackages({ a: "^2.0.0" }, (name) =>
        fetch(`${REGISTRY}${name}`).then((r) => r.json()),
      ),
    ).rejects.toThrow(/No version of a/);
  });

  it("doesn't unpack links", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tt-link-"));
    await fs.mkdir(path.join(dir, "package"));
    await fs.writeFile(path.join(dir, "package/index.js"), "1");
    await fs.symlink("/etc/passwd", path.join(dir, "package/passwd"));
    const file = path.join(dir, "pkg.tgz");
    await tar.c({ gzip: true, file, cwd: dir }, ["package"]);
    const buffer = await fs.readFile(file);
    await fs.rm(dir, { recursive: true, force: true });
    const { fetch } = registry({ a: { "1.0.0": { buffer } } });
    await installDependencies(root, { a: "1.0.0" }, { fetch });
    await expect(
      fs.lstat(path.join(root, "node_modules/a/passwd")),
    ).rejects.toThrow();
    await expect(
      fs.access(path.join(root, "node_modules/a/index.js")),
    ).resolves.toBeUndefined();
  });

  it("needs nothing when there are no packages", async () => {
    expect(await dependenciesInstalled(root, undefined)).toBe(true);
    expect(await dependenciesInstalled(root, {})).toBe(true);
  });
});
