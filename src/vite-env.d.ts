// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/// <reference types="svelte" />
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DISCORD_ISSUES: string;
  readonly VITE_DISCORD_RATINGS: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare module "prettier-plugin-java";
