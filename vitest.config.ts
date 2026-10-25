// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference types="vitest" />
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

// Everything git ignores, as coverage globs. Asking git (rather than parsing
// .gitignore) keeps negations, nested .gitignore files and global excludes
// exact. Ignored folders come back whole, e.g. "Project_tests/".
function gitIgnoredGlobs(): string[] {
  try {
    return execFileSync(
      "git",
      [
        "ls-files",
        "--others",
        "--ignored",
        "--exclude-standard",
        "--directory",
      ],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter(Boolean)
      .map((p) => (p.endsWith("/") ? `${p}**` : p));
  } catch {
    return []; // not a git checkout
  }
}

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: [
      "src/**/*.{test,spec}.{js,ts}",
      "electron/**/*.{test,spec}.{js,ts}",
    ],
    coverage: {
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      exclude: [
        ".eslintrc.cjs",
        "playwright.config.ts",
        "postcss.config.js",
        "svelte.config.js",
        "tailwind.config.js",
        "vite.config.d.ts",
        "vite.config.ts",
        "vitest.config.ts",
        "src/setupTests.ts",
        "src/tests/**",
        "src/**/*.d.ts",
        "e2e/**",
        "scripts/**",
        "dist/**",
        "release/**",
        ...gitIgnoredGlobs(),
      ],
    },
  },
  resolve: {
    conditions: ["browser"],
  },
});
