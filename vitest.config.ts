// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference types="vitest" />
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte({ hot: !process.env.VITEST })],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    include: ["src/**/*.{test,spec}.{js,ts}", "electron/**/*.{test,spec}.{js,ts}"],
    coverage: {
      reporter: ["text", "json", "json-summary", "html", "lcov"],
      exclude: ["src/setupTests.ts", "src/tests/**", "src/**/*.d.ts"],
    },
  },
  resolve: {
    conditions: ["browser"],
  },
});
