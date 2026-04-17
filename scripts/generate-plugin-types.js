// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesPath = path.join(__dirname, "../src/types/index.ts");
const outputPath = path.join(__dirname, "../plugins/turtle.d.ts");

async function generate() {
  console.log("Generating plugin types...");
  try {
    // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
    let content = fs.readFileSync(typesPath, "utf-8");

    // Remove imports/exports to make types global
    // 1. Remove import statements (they should be at the top)
    content = content.replaceAll(/^import .*$/gm, "");

    // 2. Remove 'export' keyword from declarations
    // Matches "export interface", "export type", "export const" etc.
    content = content.replaceAll(/^export /gm, "");

    const finalContent = `// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Type definitions for Turtle Tracer Plugins.
 * These types are automatically available in your .ts plugins.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 */

${content}

export {};

// Global variable exposed to plugins
declare global {
  const turtle: TurtleAPI;
}
`;

    const options = await prettier.resolveConfig(outputPath);
    const formatted = await prettier.format(finalContent, {
      ...options,
      parser: "typescript",
    });

    // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
    fs.writeFileSync(outputPath, formatted);
    console.log(`Plugin types generated at ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate plugin types:", error);
    process.exit(1);
  }
}

generate();
