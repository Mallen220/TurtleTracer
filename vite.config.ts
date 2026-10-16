// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import * as esbuild from "esbuild-wasm";
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

/**
 * Builds the two scripts that run inside plugin sandboxes, each as one
 * self-contained file the desktop app serves to plugins (see
 * electron/plugins/protocol.js): the runtime behind `turtle`, and the view
 * client behind `turtle:view`.
 */
const pluginSandboxScripts = () => ({
  name: "plugin-sandbox-scripts",
  apply: "build" as const,
  async generateBundle(this: {
    emitFile(file: { type: "asset"; fileName: string; source: string }): void;
  }) {
    const scripts = [
      ["src/lib/plugins/runtime/index.ts", "plugin-runtime.js", "iife"],
      ["src/lib/plugins/view/client.ts", "plugin-view-client.js", "esm"],
    ] as const;
    for (const [entry, fileName, format] of scripts) {
      const result = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        write: false,
        format,
        target: "es2022",
        minify: true,
        legalComments: "none",
      });
      this.emitFile({
        type: "asset",
        fileName,
        source: result.outputFiles[0].text,
      });
    }
  },
});

export default defineConfig({
  server: {
    cors: false,
  },
  preview: {
    cors: false,
  },
  plugins: [svelte(), defaultFieldMapInHtml(), pluginSandboxScripts()],
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
