// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Builds plugins/turtle.d.ts, the types plugin authors use, from the public
// plugin API in src/lib/plugins/api. Everything is put in a `Turtle`
// namespace so it can't clash with other types, and `turtle` (the global a
// plugin's main script uses) and the `turtle:view` module are declared.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.join(__dirname, "../src/lib/plugins/api");
const outputPath = path.join(__dirname, "../plugins/turtle.d.ts");

// In dependency order, so the file reads top to bottom.
const API_FILES = ["data.ts", "forms.ts", "field.ts", "turtle.ts", "view.ts"];

/** A file's declarations without its imports, `export` keywords or copyright line. */
function declarationsOf(file) {
  // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
  return fs
    .readFileSync(path.join(apiDir, file), "utf-8")
    .replace(/^\/\/ Copyright.*\n/, "")
    .replaceAll(/^import[\s\S]*?from\s+["'][^"']+["'];\s*$/gm, "")
    .replaceAll(/^export /gm, "");
}

async function generate() {
  console.log("Generating plugin types...");
  const body = API_FILES.map(declarationsOf).join("\n");

  const content = `/* eslint-disable */
// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/**
 * Types for Turtle Tracer plugins. Reference this file from your plugin's
 * scripts:
 *
 *   /// <reference path="../turtle.d.ts" />
 *
 * Your main script then gets the global \`turtle\` (Turtle.TurtleAPI), and a
 * view's scripts can \`import { connect } from "turtle:view"\`.
 *
 * AUTO-GENERATED from src/lib/plugins/api by scripts/generate-plugin-types.js.
 * Don't edit it by hand: it's replaced whenever Turtle Tracer updates.
 */

declare namespace Turtle {
${body}
}

/** The plugin API, in a plugin's main script. */
declare const turtle: Turtle.TurtleAPI;

declare module "turtle:view" {
  /** Connects a view to Turtle Tracer. Calling it again gives the same connection. */
  export function connect(): Promise<Turtle.TurtleView>;
}
`;

  const options = await prettier.resolveConfig(outputPath);
  const formatted = await prettier.format(content, {
    ...options,
    parser: "typescript",
  });
  // nosemgrep: .tools-configs.javascript_pathtraversal_rule-non-literal-fs-filename
  fs.writeFileSync(outputPath, formatted);
  console.log(`Plugin types generated at ${outputPath}`);
}

try {
  await generate();
} catch (error) {
  console.error("Failed to generate plugin types:", error);
  process.exit(1);
}
