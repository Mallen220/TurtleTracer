// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Starts the built desktop app with --smoke-test: it exits 0 once the page has
// loaded and the app has started (the page tells the app it's ready), or 1 if
// that takes too long. Playwright can't drive the macOS webview, so this is
// the check that runs on every OS.
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

const TARGET = path.resolve(process.cwd(), "src-tauri", "target");

/** The built app's executable, from TT_EXE or the newest Tauri build. */
function findExecutable(): string {
  if (process.env.TT_EXE) return process.env.TT_EXE;
  const names: Record<string, string[]> = {
    darwin: ["bundle/macos/Turtle Tracer.app/Contents/MacOS/Turtle Tracer"],
    win32: ["Turtle Tracer.exe"],
    linux: ["turtle-tracer"],
  };
  const candidates = (names[os.platform()] ?? []).flatMap((name) =>
    ["release", "debug"].map((profile) => path.join(TARGET, profile, name)),
  );
  const found = candidates.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      `No built app found. Run "npx tauri build" first, or set TT_EXE. Looked in:\n${candidates.join("\n")}`,
    );
  }
  return found;
}

function run(exe: string, dataDir: string) {
  return new Promise<{ code: number | null; output: string }>((resolve) => {
    const child = spawn(exe, ["--smoke-test"], {
      env: { ...process.env, TT_DATA_DIR: dataDir },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("error", (e) => resolve({ code: -1, output: String(e) }));
    child.on("exit", (code) => resolve({ code, output }));
  });
}

test("the app starts and its page loads", async () => {
  test.setTimeout(60_000);
  const exe = findExecutable();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tt-boot-"));
  console.log(`Starting ${exe}`);

  const { code, output } = await run(exe, dataDir);
  console.log(output);

  // Exit code 0 means the page started (its output may not reach us from a
  // Windows GUI app).
  expect(code).toBe(0);
  // The bundled plugins were copied into the fresh data folder.
  expect(fs.readdirSync(path.join(dataDir, "plugins"))).toContain(
    "turtle.d.ts",
  );
  fs.rmSync(dataDir, { recursive: true, force: true });
});
