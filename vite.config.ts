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
    },
  },
  base: "./",
});
