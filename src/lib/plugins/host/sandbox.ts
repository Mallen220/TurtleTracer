// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Sandboxed frames for plugins: the hidden one a plugin's main script runs
// in, and the visible ones for its views. Frames are on the plugin's own
// turtle-plugin:// origin, sandboxed so it is opaque (no storage, no access
// to the app), and Electron runs them in their own process.
import { CONNECT, HELLO } from "../protocol/runtime";

export const pluginUrl = (pluginId: string, path: string) =>
  `turtle-plugin://${pluginId}/${path}`;

/** Makes a sandboxed iframe for `url`. Only scripts are allowed in it. */
export function createSandboxFrame(url: string, title: string) {
  const frame = document.createElement("iframe");
  frame.setAttribute("sandbox", "allow-scripts");
  frame.setAttribute("title", title);
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.src = url;
  return frame;
}

/** A hidden frame, for a plugin's main script. */
export function createHiddenFrame(url: string, title: string) {
  const frame = createSandboxFrame(url, title);
  // Kept laid out (not display: none) so the browser doesn't throttle it.
  frame.setAttribute("aria-hidden", "true");
  frame.tabIndex = -1;
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10px",
    top: "-10px",
    width: "1px",
    height: "1px",
    border: "0",
    opacity: "0",
    pointerEvents: "none",
  });
  return frame;
}

/**
 * Waits for the script in `frame` to say hello, then hands it a port (and
 * `connect`, the data it starts with). Calls `onPort` with our end each time
 * the frame (re)connects, e.g. after reloading itself.
 */
export function connectToFrame(
  frame: HTMLIFrameElement,
  connect: () => Record<string, unknown>,
  onPort: (port: MessagePort) => void,
): () => void {
  const onMessage = (event: MessageEvent) => {
    if (event.source !== frame.contentWindow) return;
    if (event.data?.type !== HELLO) return;
    const channel = new MessageChannel();
    // The frame's origin is opaque, so "*" is the only target that reaches it.
    frame.contentWindow?.postMessage({ type: CONNECT, ...connect() }, "*", [
      channel.port2,
    ]);
    onPort(channel.port1);
  };
  globalThis.addEventListener("message", onMessage);
  return () => globalThis.removeEventListener("message", onMessage);
}
