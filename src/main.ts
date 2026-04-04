// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import "./app.scss";
import App from "./App.svelte";
import { browserFileSystem } from "./utils/browserFileSystem";
import { mount } from "svelte";

if (typeof window !== "undefined" && !window.electronAPI) {
  (window as any).electronAPI = browserFileSystem;
}

const app = mount(App, {
  target: document.body!,
});

export default app;
