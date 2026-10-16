// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Plugins in the packaged app, where files come out of the asar and there's
// no Node.js but Electron's own.
import {
  test,
  _electron as electron,
  expect,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { resolveExecutablePath } from "./packagedApp";

/** Plugins that misbehave on purpose. */
const FIXTURES = path.resolve(process.cwd(), "e2e", "fixtures", "plugins");

let userData: string;
let app: ElectronApplication | undefined;

test.beforeEach(() => {
  userData = fs.mkdtempSync(path.join(os.tmpdir(), "turtle-plugins-"));
});

test.afterEach(async () => {
  await app?.close();
  app = undefined;
  fs.rmSync(userData, { recursive: true, force: true, maxRetries: 3 });
});

/** Starts the packaged app on the test's own profile. */
async function launch(): Promise<Page> {
  app = await electron.launch({
    executablePath: resolveExecutablePath(
      os.platform(),
      path.resolve(process.cwd(), "release"),
    ),
    args: ["--no-sandbox", "--disable-gpu", `--user-data-dir=${userData}`],
  });
  const page = await app.firstWindow();
  await page.waitForSelector("#field-container");
  return page;
}

/** Frames the app draws in `ms`: about 60 a second when it's free, none when it's frozen. */
function framesIn(page: Page, ms: number): Promise<number> {
  return page.evaluate(
    (ms) =>
      new Promise<number>((resolve) => {
        let frames = 0;
        const end = performance.now() + ms;
        const tick = () => {
          frames++;
          if (performance.now() < end) requestAnimationFrame(tick);
          else resolve(frames);
        };
        requestAnimationFrame(tick);
      }),
    ms,
  );
}

/** What Escape Artist's attempts came to, once it has made them all. */
async function escapeResults(
  page: Page,
): Promise<Record<string, string> | undefined> {
  const frame = page
    .frames()
    .find((f) => f.url().startsWith("turtle-plugin://escape-artist/"));
  return frame?.evaluate(
    () =>
      (globalThis as { escapeResults?: Record<string, string> }).escapeResults,
  );
}

test("a new profile gets the bundled plugins and their types", async () => {
  await launch();
  const plugins = path.join(userData, "plugins");
  await expect
    .poll(() => fs.existsSync(path.join(plugins, "csv-export", "plugin.json")))
    .toBe(true);
  await expect
    .poll(() => fs.existsSync(path.join(plugins, "turtle.d.ts")))
    .toBe(true);
});

test("misbehaving plugins can't get out or freeze the app", async () => {
  test.setTimeout(120_000);
  fs.cpSync(FIXTURES, path.join(userData, "plugins"), { recursive: true });
  const on = { enabled: true };
  fs.writeFileSync(
    path.join(userData, "plugin-state.json"),
    JSON.stringify({
      version: 1,
      plugins: { "escape-artist": on, looper: on, hog: on },
    }),
  );

  const page = await launch();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const appUrl = page.url();

  // Looper spins forever while it starts. That's its own process's
  // problem, not the app's.
  expect(await framesIn(page, 2000)).toBeGreaterThan(20);

  // Escape Artist's main script has to be bundled first, so this also
  // shows bundling works without Node.js.
  await expect
    .poll(() => escapeResults(page), { timeout: 20_000 })
    .toBeDefined();
  const results = (await escapeResults(page))!;
  const allowed = Object.entries(results).filter(
    ([, result]) => !result.startsWith("blocked"),
  );
  expect(allowed).toEqual([]);

  // Hog's command never returns: the app keeps going and stops it.
  await page.keyboard.press("Control+P");
  // Filled rather than typed: keys pressed before the palette has focus
  // would go to the app's shortcuts and change the project.
  await page.getByPlaceholder("Type a command or search...").fill("Hog: hang");
  await expect(page.getByText("Hog: hang forever")).toBeVisible();
  await page.keyboard.press("Enter");
  expect(await framesIn(page, 2000)).toBeGreaterThan(20);
  await expect(
    page.getByText("Hog was stopped: it stopped responding"),
  ).toBeVisible({ timeout: 20_000 });

  // Looper has had its 15 seconds to start.
  await page.keyboard.press("Control+Shift+P");
  await expect(page.locator('h3[title="looper"] + div')).toContainText(
    "Failed",
    { timeout: 20_000 },
  );
  await expect(page.locator('h3[title="hog"] + div')).toContainText(
    "Not responding",
  );

  expect(page.url()).toBe(appUrl);
  expect(pageErrors).toEqual([]);
});
