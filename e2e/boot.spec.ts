// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { test, _electron as electron, expect } from "@playwright/test";
import * as path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";
import { logReleaseDir, resolveExecutablePath } from "./packagedApp";

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
