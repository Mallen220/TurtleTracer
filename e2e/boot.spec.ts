// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { test, _electron as electron, expect } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

function logReleaseDir(releaseDir: string): void {
  if (fs.existsSync(releaseDir)) {
    console.log(`Contents of ${releaseDir}:`, fs.readdirSync(releaseDir));
    return;
  }
  console.log(`${releaseDir} does not exist!`);
}

function findFirstExisting(paths: string[]): string {
  for (const p of paths) {
    if (fs.existsSync(p)) return p;
  }
  return "";
}

function findAppBundleInDir(dir: string): string {
  const files = fs.readdirSync(dir);
  const appFile = files.find((file) => file.endsWith(".app"));
  return appFile ? path.join(dir, appFile) : "";
}

function resolveMacExecutable(releaseDir: string): string {
  const possibleDirs = ["mac", "mac-arm64", "mac-universal"];

  for (const dir of possibleDirs) {
    const fullDir = path.join(releaseDir, dir);
    if (!fs.existsSync(fullDir)) {
      console.log(`Dir not found: ${fullDir}`);
      continue;
    }

    console.log(`Found dir: ${fullDir}`);
    console.log(`Contents:`, fs.readdirSync(fullDir));

    const appPath = findAppBundleInDir(fullDir);
    if (!appPath) continue;

    const binary = findFirstExisting([
      path.join(appPath, "Contents", "MacOS", "Turtle Tracer"),
    ]);
    if (binary) return binary;

    throw new Error(
      `Could not find macOS binary inside ${appPath}/Contents/MacOS`,
    );
  }

  throw new Error(`Could not find .app in ${releaseDir}`);
}

function resolveWindowsExecutable(releaseDir: string): string {
  const fullDir = path.join(releaseDir, "win-unpacked");
  if (!fs.existsSync(fullDir)) {
    throw new Error(`Could not find executable in ${releaseDir}/win-unpacked`);
  }

  const exePath = findFirstExisting([path.join(fullDir, "Turtle Tracer.exe")]);

  if (exePath) return exePath;
  throw new Error(`Could not find executable in ${releaseDir}/win-unpacked`);
}

function resolveLinuxExecutable(releaseDir: string): string {
  const fullDir = path.join(releaseDir, "linux-unpacked");
  if (!fs.existsSync(fullDir)) {
    throw new Error(
      `Could not find executable in ${releaseDir}/linux-unpacked`,
    );
  }

  const binaryPath = findFirstExisting([
    path.join(fullDir, "turtle-tracer"),
    path.join(fullDir, "Turtle Tracer"),
  ]);

  if (binaryPath) return binaryPath;
  throw new Error(`Could not find executable in ${releaseDir}/linux-unpacked`);
}

function resolveExecutablePath(platform: string, releaseDir: string): string {
  if (platform === "darwin") return resolveMacExecutable(releaseDir);
  if (platform === "win32") return resolveWindowsExecutable(releaseDir);
  if (platform === "linux") return resolveLinuxExecutable(releaseDir);
  throw new Error(`Unsupported platform: ${platform}`);
}

function ensureDirExists(dirPath: string): void {
  if (fs.existsSync(dirPath)) return;
  fs.mkdirSync(dirPath, { recursive: true });
}

test("app boots and displays main interface", async () => {
  const platform = os.platform();
  const arch = os.arch();
  const releaseDir = path.resolve(process.cwd(), "release");

  console.log(`Platform: ${platform}, Arch: ${arch}`);
  console.log(`Release dir: ${releaseDir}`);
  logReleaseDir(releaseDir);

  const executablePath = resolveExecutablePath(platform, releaseDir);

  console.log(`Executable path: ${executablePath}`);

  // Launch the app
  const app = await electron.launch({
    executablePath,
    args: ["--no-sandbox", "--disable-gpu"], // Sometimes needed for linux environments like Docker
  });

  // Verify
  const window = await app.firstWindow();
  await window.waitForLoadState("domcontentloaded");

  // Check for some element or title
  const title = await window.title();
  console.log(`App title: ${title}`);

  // Take screenshot immediately to see what's wrong
  const screenshotPath = path.join(
    process.cwd(),
    "test-results",
    `boot-${platform}-${arch}.png`,
  );
  ensureDirExists(path.dirname(screenshotPath));
  await window.screenshot({ path: screenshotPath });
  console.log(`Screenshot saved to ${screenshotPath}`);

  // Basic assertion
  expect(title).toContain("Turtle Tracer");
  console.log(`Screenshot saved to ${screenshotPath}`);

  await app.close();
});
