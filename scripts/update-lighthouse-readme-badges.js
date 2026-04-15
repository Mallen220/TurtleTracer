// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/* eslint-env node */
/* global URL, process, console */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const isFileModuleUrl = import.meta.url.startsWith("file:");
const relativeOutputDir = "README_Content/lighthouse-badges";
const defaultBadgeUrl = "http://localhost:4173/";

function getRepoRootPath() {
  return isFileModuleUrl
    ? fileURLToPath(new URL("../", import.meta.url))
    : path.resolve(process.cwd());
}

function getReadmePath() {
  return isFileModuleUrl
    ? new URL("../README.md", import.meta.url)
    : path.resolve(process.cwd(), "README.md");
}

function getOutputDirPath() {
  return isFileModuleUrl
    ? fileURLToPath(
        new URL("../README_Content/lighthouse-badges/", import.meta.url),
      )
    : path.resolve(process.cwd(), "README_Content/lighthouse-badges");
}

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
  const repoRootPath = getRepoRootPath();
  const outputDirPath = getOutputDirPath();
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

export function replaceBetweenMarkers(content, replacement) {
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
  const outputDirPath = getOutputDirPath();
  // nosemgrep
  await fs.mkdir(outputDirPath, { recursive: true });
}

async function verifyArtifacts() {
  const outputDirPath = getOutputDirPath();
  const expectedFiles = [
    "lighthouse_accessibility.svg",
    "lighthouse_best-practices.svg",
    "lighthouse_performance.svg",
    "lighthouse_seo.svg",
  ];

  for (const file of expectedFiles) {
    await fs.access(path.join(outputDirPath, file));
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

  // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
  // nosemgrep
  const packageJsonContent = await fs.readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  const { version } = JSON.parse(packageJsonContent);

  const readmePathValue = getReadmePath();
  const readme = await fs.readFile(readmePathValue, "utf8");
  const updatedBlock = buildReadmeBadgeBlock(version);
  const nextReadme = replaceBetweenMarkers(readme, updatedBlock);

  // nosemgrep
  await fs.writeFile(readmePathValue, nextReadme, "utf8");

  console.log("README Lighthouse badge section updated.");
}

if (isFileModuleUrl && process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error("Failed to update Lighthouse badges:", error.message);
    process.exit(1);
  });
}
