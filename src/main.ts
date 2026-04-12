// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import "./app.scss";
import App from "./App.svelte";
import { browserFileSystem } from "./utils/browserFileSystem";
import { mount } from "svelte";
import { isBrowser } from "./utils/platform";

if (isBrowser) {
  document.body.classList.add("is-browser");
}

if (typeof globalThis !== "undefined" && !(globalThis as any).electronAPI) {
  (globalThis as any).electronAPI = browserFileSystem;
}

const app = mount(App, {
  target: document.body!,
});

export default app;
