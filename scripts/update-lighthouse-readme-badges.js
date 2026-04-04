// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/* eslint-env node */
/* global URL, process, console */
import fs from "fs/promises";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const repoRoot = new URL("../", import.meta.url);
const repoRootPath = fileURLToPath(repoRoot);
const readmePath = new URL("../README.md", import.meta.url);
const outputDir = new URL(
  "../README_Content/lighthouse-badges/",
  import.meta.url,
);
const outputDirPath = fileURLToPath(outputDir);
const relativeOutputDir = "README_Content/lighthouse-badges";
const defaultBadgeUrl = "http://localhost:4173/";

function getArgValue(flagNames) {
  for (let i = 0; i < process.argv.length; i += 1) {
    if (flagNames.includes(process.argv[i])) {
      return process.argv[i + 1];
    }
  }
  return null;
}

function runLighthouseBadges(url) {
  const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
  const args = [
    "--yes",
    "lighthouse-badges",
    "--url",
    url,
    "--output-path",
    outputDirPath,
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(npxCommand, args, {
      cwd: repoRootPath,
      stdio: "inherit",
      shell: false,
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`lighthouse-badges exited with code ${code}`));
      }
    });

    child.on("error", reject);
  });
}

function buildReadmeBadgeBlock(version) {
  const lighthouseLink = "https://github.com/GoogleChrome/lighthouse";

  return [
    "  <!-- LIGHTHOUSE_BADGES_START -->",
    "  <p>",
    `    <a href="${lighthouseLink}">`,
    `      <img src="${relativeOutputDir}/lighthouse_accessibility.svg" alt="Lighthouse Accessibility Badge">`,
    "    </a>",
    `    <a href="${lighthouseLink}">`,
    `      <img src="${relativeOutputDir}/lighthouse_best-practices.svg" alt="Lighthouse Best Practices Badge">`,
    "    </a>",
    `    <a href="${lighthouseLink}">`,
    `      <img src="${relativeOutputDir}/lighthouse_performance.svg" alt="Lighthouse Performance Badge">`,
    "    </a>",
    `    <a href="${lighthouseLink}">`,
    `      <img src="${relativeOutputDir}/lighthouse_seo.svg" alt="Lighthouse SEO Badge">`,
    "    </a>",
    "  </p>",
    /* No overall badge since lighthouse-badges only generates individual ones by default */
    `  <p><sub>Lighthouse badges generated for v${version}</sub></p>`,
    "  <!-- LIGHTHOUSE_BADGES_END -->",
  ].join("\n");
}

function replaceBetweenMarkers(content, replacement) {
  const pattern =
    /\s*<!-- LIGHTHOUSE_BADGES_START -->[\s\S]*?<!-- LIGHTHOUSE_BADGES_END -->/;

  if (!pattern.test(content)) {
    throw new Error(
      "Could not find LIGHTHOUSE_BADGES markers in README.md. Add LIGHTHOUSE_BADGES_START and LIGHTHOUSE_BADGES_END markers first.",
    );
  }

  return content.replace(pattern, `\n${replacement}`);
}

async function ensureOutputDirectory() {
  // nosemgrep
  await fs.mkdir(outputDir, { recursive: true });
}

async function verifyArtifacts() {
  const expectedFiles = [
    "lighthouse_accessibility.svg",
    "lighthouse_best-practices.svg",
    "lighthouse_performance.svg",
    "lighthouse_seo.svg",
  ];

  for (const file of expectedFiles) {
    const fullPath = new URL(file, outputDir);
    await fs.access(fullPath);
  }
}

async function main() {
  const url =
    getArgValue(["--url", "-u"]) ||
    process.env.LIGHTHOUSE_BADGE_URL ||
    defaultBadgeUrl;

  if (!url) {
    console.error(
      "Missing URL. Use --url https://live.turtletracer.com/ or set LIGHTHOUSE_BADGE_URL.",
    );
    process.exit(1);
  }

  console.log(`Generating Lighthouse badges for ${url}...`);

  await ensureOutputDirectory();
  await runLighthouseBadges(url);

  await verifyArtifacts();

  // nosemgrep: codacy.tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
  // nosemgrep
  const packageJsonContent = await fs.readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  const { version } = JSON.parse(packageJsonContent);

  const readme = await fs.readFile(readmePath, "utf8");
  const updatedBlock = buildReadmeBadgeBlock(version);
  const nextReadme = replaceBetweenMarkers(readme, updatedBlock);

  // nosemgrep
  await fs.writeFile(readmePath, nextReadme, "utf8");

  console.log("README Lighthouse badge section updated.");
}

main().catch((error) => {
  console.error("Failed to update Lighthouse badges:", error.message);
  process.exit(1);
});
