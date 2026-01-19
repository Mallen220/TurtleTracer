// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const typesPath = path.join(__dirname, "../src/types.ts");
const outputPath = path.join(__dirname, "../plugins/pedro.d.ts");

function generate() {
  console.log("Generating plugin types...");
  try {
    let content = fs.readFileSync(typesPath, "utf-8");

    // Remove imports/exports to make types global
    // 1. Remove import statements (assuming they are at the top)
    content = content.replace(/^import .*$/gm, "");

    // 2. Remove 'export' keyword from declarations
    // Matches "export interface", "export type", "export const" etc.
    content = content.replace(/^export /gm, "");

    const finalContent = `// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.

/**
 * Type definitions for Pedro Pathing Visualizer Plugins.
 * These types are automatically available in your .ts plugins.
 *
 * AUTO-GENERATED - DO NOT EDIT MANUALLY
 */

${content}

export {};

// Global variable exposed to plugins
declare global {
  const pedro: PedroAPI;
}
`;

    fs.writeFileSync(outputPath, finalContent);
    console.log(`Plugin types generated at ${outputPath}`);
  } catch (error) {
    console.error("Failed to generate plugin types:", error);
    process.exit(1);
  }
}

generate();
