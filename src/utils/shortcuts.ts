// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { KeyBinding } from "../types";

export function getDisplayShortcut(
  actionId: string,
  settingsKeybindings?: KeyBinding[],
): string {
  if (!settingsKeybindings) return "";

  const binding = settingsKeybindings.find((b) => b.action === actionId || b.id === actionId);
  if (!binding || !binding.key) return "";

  const isMac =
    /Mac|iPod|iPhone|iPad/.test(navigator.platform) ||
    /Mac/.test(navigator.userAgent);

  const parts = binding.key.split(",").map((s) => s.trim());
  let best = parts[0];

  if (isMac) {
    const mac = parts.find((p) => p.toLowerCase().includes("cmd"));
    if (mac) best = mac;
  } else {
    const nonMac = parts.find(
      (p) =>
        !p.toLowerCase().includes("cmd") || p.toLowerCase().includes("ctrl"),
    );
    if (nonMac) best = nonMac;
  }

  // Format the keys
  return best
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
