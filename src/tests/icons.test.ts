// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const iconsDir = path.resolve(__dirname, "../lib/components/icons");
const srcDir = path.resolve(__dirname, "..");

describe("Icon System Integration", () => {
  const iconFiles = fs
    .readdirSync(iconsDir)
    .filter((f) => f.endsWith(".svelte"));
  const indexContent = fs.readFileSync(
    path.join(iconsDir, "index.ts"),
    "utf-8",
  );

  // Pre-scan the codebase for icon usages to make tests faster
  const allSrcFiles: string[] = [];
  function walk(dir: string) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      if (fs.statSync(fullPath).isDirectory()) {
        if (
          file !== "icons" &&
          file !== "node_modules" &&
          file !== ".git" &&
          file !== "tests"
        ) {
          walk(fullPath);
        }
      } else if (
        file.endsWith(".svelte") ||
        file.endsWith(".ts") ||
        file.endsWith(".js")
      ) {
        allSrcFiles.push(fullPath);
      }
    }
  }
  walk(srcDir);

  const codebaseContent = allSrcFiles
    .map((f) => fs.readFileSync(f, "utf-8"))
    .join("\n");

  iconFiles.forEach((file) => {
    const iconName = file.replace(".svelte", "");
    const filePath = path.join(iconsDir, file);

    describe(`Icon: ${iconName}`, () => {
      it("should have valid SVG structure", () => {
        const content = fs.readFileSync(filePath, "utf-8");
        expect(content).toContain("<svg");
        expect(content).toMatch(/<\/svg\s*>/);
        // Basic SVG validation - ensure it's not empty and has essential attributes
        expect(content).toMatch(/viewBox=["']0 0 \d+ \d+["']/);
      });

      it("should be exported in index.ts", () => {
        const exportRegex = new RegExp(
          `export { default as \\w+ } from "./${file}";`,
        );
        const exportRegexSimple = new RegExp(
          `export { default as ${iconName} } from "./${file}";`,
        );
        const isExported = exportRegex.test(indexContent);
        expect(isExported, `Icon ${file} is not exported in index.ts`).toBe(
          true,
        );
      });

      it("should be used in the codebase", () => {
        // Check for the icon name in the codebase (excluding exports in index.ts)
        // We look for the icon name being used as a component <PlusIcon or in an import { PlusIcon }
        // or even in a dynamic reference if any.

        // Find what it's exported as in index.ts
        const exportMatch = indexContent.match(
          new RegExp(`export { default as (\\w+) } from "./${file}";`),
        );
        const exportedName = exportMatch ? exportMatch[1] : iconName;

        const isUsed =
          new RegExp(`\\b${exportedName}\\b`).test(codebaseContent) ||
          new RegExp(`\\b${iconName}\\b`).test(codebaseContent);
        expect(
          isUsed,
          `Icon ${exportedName} (from ${file}) appears to be unused in the application`,
        ).toBe(true);
      });
    });
  });

  it("should not have any broken exports in index.ts", () => {
    const exports = indexContent.match(/from "\.\/([^"]+)\.svelte"/g);
    if (exports) {
      exports.forEach((exp) => {
        const fileName = exp.match(/"\.\/([^"]+)\.svelte"/)?.[1] + ".svelte";
        const exists = fs.existsSync(path.join(iconsDir, fileName));
        expect(exists, `Index.ts exports non-existent file: ${fileName}`).toBe(
          true,
        );
      });
    }
  });
});
