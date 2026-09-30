// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { DEFAULT_FIELD_MAP } from "./src/config/fieldMaps";

/** Fills %DEFAULT_FIELD_MAP% in index.html with the app's default field image. */
const defaultFieldMapInHtml = () => ({
  name: "default-field-map-in-html",
  transformIndexHtml: {
    order: "pre" as const,
    handler: (html: string) =>
      html.split("%DEFAULT_FIELD_MAP%").join(DEFAULT_FIELD_MAP),
  },
});

export default defineConfig({
  server: {
    cors: false,
  },
  preview: {
    cors: false,
  },
  plugins: [svelte(), defaultFieldMapInHtml()],
  resolve: {
    alias: {
      "prettier/doc": "prettier/doc.js",
      prettier: "prettier/standalone.js",
    },
    extensions: [
      ".mjs",
      ".js",
      ".ts",
      ".jsx",
      ".tsx",
      ".json",
      ".svelte",
      ".svelte.ts",
    ],
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
        entryFileNames: `assets/[name]-[hash].js`,
        chunkFileNames: `assets/[name]-[hash].js`,
        assetFileNames: `assets/[name]-[hash].[ext]`,
      },
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
        } catch {
          // If anything goes wrong, forward the warning to the default handler
        }
        warn(warning);
      },
    },
  },
  base: "./",
});
