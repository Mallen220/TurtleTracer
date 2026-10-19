// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { KeyBinding } from "../types";

export function matchShortcut(event: KeyboardEvent, shortcut: string): boolean {
  if (!shortcut) return false;

  const options = shortcut.split(",").map((s) => s.trim());

  for (const option of options) {
    if (!option) continue;

    const parts = option.split("+").map((s) => s.trim().toLowerCase());

    let needsCtrl = false;
    let needsShift = false;
    let needsAlt = false;
    let needsMeta = false;
    let keyPart = "";

    for (const part of parts) {
      if (part === "ctrl" || part === "control") needsCtrl = true;
      else if (part === "shift") needsShift = true;
      else if (part === "alt") needsAlt = true;
      else if (part === "cmd" || part === "command" || part === "meta")
        needsMeta = true;
      else keyPart = part;
    }

    const eventKey = event.key.toLowerCase();

    // Normalize special keys if needed (e.g. space)
    let normalizedEventKey = eventKey;
    if (eventKey === " ") normalizedEventKey = "space";

    // If the shortcut key is just a modifier, this check fails as keyPart is empty
    if (!keyPart) continue;

    const matchModifiers =
      event.ctrlKey === needsCtrl &&
      event.shiftKey === needsShift &&
      event.altKey === needsAlt &&
      event.metaKey === needsMeta;

    if (matchModifiers && normalizedEventKey === keyPart) {
      return true;
    }
  }

  return false;
}

const runningOnMac = () =>
  /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
  /Mac/.test(navigator.userAgent);

/**
 * The one to show from alternatives such as "cmd+s, ctrl+s": the Cmd one on a
 * Mac, otherwise one that doesn't need Cmd.
 */
export function preferredShortcut(
  shortcuts: string,
  isMac = runningOnMac(),
): string {
  const parts = shortcuts.split(",").map((s) => s.trim());
  if (isMac) {
    return parts.find((p) => p.toLowerCase().includes("cmd")) ?? parts[0];
  }
  return (
    parts.find(
      (p) =>
        !p.toLowerCase().includes("cmd") || p.toLowerCase().includes("ctrl"),
    ) ?? parts[0]
  );
}

export function getDisplayShortcut(
  actionId: string,
  settingsKeybindings?: KeyBinding[],
): string {
  if (!settingsKeybindings) return "";

  const binding = settingsKeybindings.find(
    (b) => b.action === actionId || b.id === actionId,
  );
  if (!binding?.key) return "";

  const isMac = runningOnMac();

  // Format the keys
  return preferredShortcut(binding.key, isMac)
    .split("+")
    .map((key) => key.trim())
    .map((key) => {
      if (key.toLowerCase() === "cmd" || key.toLowerCase() === "command") {
        return isMac ? "⌘" : "Ctrl";
      }
      if (key.toLowerCase() === "ctrl" || key.toLowerCase() === "control") {
        return "Ctrl";
      }
      if (key.toLowerCase() === "shift") return "Shift";
      if (key.toLowerCase() === "alt") return isMac ? "⌥" : "Alt";
      if (key.toLowerCase() === "enter") return "Enter";
      if (key.toLowerCase() === "escape") return "Esc";
      if (key.toLowerCase() === "backspace") return "⌫";
      if (key.toLowerCase() === "delete") return "Del";
      if (key.toLowerCase() === "up") return "↑";
      if (key.toLowerCase() === "down") return "↓";
      if (key.toLowerCase() === "left") return "←";
      if (key.toLowerCase() === "right") return "→";

      return key.charAt(0).toUpperCase() + key.slice(1);
    })
    .join(isMac ? " " : " + ");
}
