// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/* eslint-env node */
/* global process, console */
import fs from "node:fs/promises";

const readmePath = new URL("../README.md", import.meta.url);
const coverageSummaryPath = new URL(
  "../coverage/coverage-summary.json",
  import.meta.url,
);
const badgeOutputPath = new URL(
  "../README_Content/coverage-badge.svg",
  import.meta.url,
);

async function downloadBadge(url, path) {
  const response = await fetch(url);
  const buffer = await response.arrayBuffer();
  await fs.writeFile(path, Buffer.from(buffer));
}

async function main() {
  let summaryContent;
  try {
    summaryContent = await fs.readFile(coverageSummaryPath, "utf8");
  } catch {
    console.error(
      "Could not read coverage-summary.json. Did you run vitest with coverage?",
    );
    process.exit(1);
  }

  const summary = JSON.parse(summaryContent);
  const pct = summary.total.functions.pct;

  if (typeof pct !== "number") {
    console.error("Invalid coverage summary format.");
    process.exit(1);
  }

  let color = "brightgreen";
  if (pct < 90) color = "green";
  if (pct < 80) color = "yellow";
  if (pct < 70) color = "orange";
  if (pct < 50) color = "red";

  const badgeUrl = `https://img.shields.io/badge/Coverage-${pct}%25-${color}`;

  console.log(`Downloading coverage badge: ${pct}%...`);
  await downloadBadge(badgeUrl, badgeOutputPath);

  const relativeBadgePath = "README_Content/coverage-badge.svg";
  const replacement = `  <!-- COVERAGE_BADGE_START -->\n  <a href="coverage/index.html">\n    <img src="${relativeBadgePath}" alt="Function Coverage: ${pct}%" height="20">\n  </a>\n  <!-- COVERAGE_BADGE_END -->`;

  const readme = await fs.readFile(readmePath, "utf8");

  const startMarker = "<!-- COVERAGE_BADGE_START -->";
  const endMarker = "<!-- COVERAGE_BADGE_END -->";
  const startIndex = readme.indexOf(startMarker);
  const endIndex = readme.indexOf(endMarker, startIndex + startMarker.length);

  if (startIndex === -1 || endIndex === -1) {
    throw new Error(
      "Could not find COVERAGE_BADGE markers in README.md. Add COVERAGE_BADGE_START and COVERAGE_BADGE_END markers first.",
    );
  }

  const nextReadme =
    readme.slice(0, startIndex) +
    `\n${replacement}` +
    readme.slice(endIndex + endMarker.length);
  await fs.writeFile(readmePath, nextReadme, "utf8");

  console.log(`Updated README with coverage badge: ${pct}%`);
}

main().catch((err) => {
  console.error("Failed to update coverage badge:", err.message);
  process.exit(1);
});
