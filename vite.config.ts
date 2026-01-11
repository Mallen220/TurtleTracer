// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";

export default defineConfig({
  plugins: [svelte()],
  resolve: {
    alias: {
      "prettier/doc": "prettier/doc.js",
      prettier: "prettier/standalone.js",
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: "modern-compiler", // or "modern"
      } as any,
    },
  },
  build: {
    outDir: "dist",
    // Increase chunk size warning limit to 3 MB to avoid noisy warnings
    chunkSizeWarningLimit: 3000,
    rollupOptions: {
      output: {
        entryFileNames: `assets/[name].js`,
        chunkFileNames: `assets/[name].js`,
        assetFileNames: `assets/[name].[ext]`,
      },
      // Suppress noisy Rollup warning about modules both dynamically and statically imported
      // See: dynamic import will not move module into another chunk.
      // We selectively ignore only that specific message to avoid hiding other warnings.
      onwarn(warning, warn) {
        try {
          const message = warning && (warning.message || String(warning));
          if (
            typeof message === "string" &&
            message.includes(
              "dynamic import will not move module into another chunk",
            )
          ) {
            return;
          }
        } catch (e) {
          // If anything goes wrong, forward the warning to the default handler
        }
        warn(warning);
      },
    },
  },
  base: "./",
});
