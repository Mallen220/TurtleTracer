#!/usr/bin/env node
// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Generate a macOS-friendly app icon from the source PNG.
 *
 * Problem: macOS/electron-builder can produce a white-ish border around icons
 * when the source PNG contains partially-transparent pixels (alpha < 255).
 * This script flattens the icon onto its background color and ensures the
 * output PNG is fully opaque, which prevents macOS icon compositing artifacts.
 */

import fs from "fs";
import path from "path";
import sharp from "sharp";

const SRC = path.resolve(process.cwd(), "public", "icon.png");
const DST = path.resolve(process.cwd(), "build", "icon.png");

async function main() {
  if (!fs.existsSync(SRC)) {
    console.error("Source icon not found at", SRC);
    process.exit(1);
  }

  // Ensure build directory exists before writing the icon.
  fs.mkdirSync(path.dirname(DST), { recursive: true });

  // The source icon has a subtle semi-transparent border due to antialiasing.
  // Flatten it onto its own background color to remove alpha and prevent
  // macOS from compositing a white border.
  const background = { r: 206, g: 180, b: 106, alpha: 1 };

  await sharp(SRC)
    .resize(1024, 1024, {
      fit: "contain",
      background: background,
    })
    .flatten({ background })
    .png({ compressionLevel: 9, quality: 100 })
    .toFile(DST);

  console.log("Wrote", DST);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
