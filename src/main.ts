// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import "./app.scss";
import { mount } from "svelte";
import {
  createTauriBridge,
  importLegacyWebStorage,
  installDesktopGuards,
  isTauri,
} from "./utils/tauriBridge";

async function start() {
  let notice: string | null = null;
  if (isTauri()) {
    globalThis.electronAPI = createTauriBridge();
    installDesktopGuards();
    // Before any app module loads: stores read (and write back) localStorage
    // as they're imported, which would hide the old app's values.
    notice = await importLegacyWebStorage();
  } else {
    document.body.classList.add("is-browser");
    // In a plain browser, files live in IndexedDB instead of on disk.
    const { browserFileSystem } = await import("./utils/browserFileSystem");
    globalThis.electronAPI ??= browserFileSystem;
  }

  const [{ default: App }, { notification }] = await Promise.all([
    import("./App.svelte"),
    import("./stores"),
  ]);
  mount(App, { target: document.body! });

  if (notice) notification.set({ message: notice, type: "info", timeout: 0 });
}

// The build targets browsers without top-level await.
// eslint-disable-next-line unicorn/prefer-top-level-await
void start();
