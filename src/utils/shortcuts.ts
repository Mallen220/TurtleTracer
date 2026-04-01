// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { KeyBinding } from "../types";

export function getDisplayShortcut(
  actionId: string,
  settingsKeybindings?: KeyBinding[],
): string {
  if (!settingsKeybindings) return "";

  const binding = settingsKeybindings.find(
    (b) => b.action === actionId || b.id === actionId,
  );
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

  return best
    .split("+")
    .map((key) => key.trim())
    .map((key) => {
      const lower = key.toLowerCase();
      if (lower === "cmd" || lower === "command") return isMac ? "⌘" : "Ctrl";
      if (lower === "ctrl" || lower === "control") return "Ctrl";
      if (lower === "shift") return "Shift";
      if (lower === "alt") return isMac ? "⌥" : "Alt";
      if (lower === "enter") return "Enter";
      if (lower === "escape") return "Esc";
      if (lower === "backspace") return "⌫";
      if (lower === "delete") return "Del";
      if (lower === "up") return "↑";
      if (lower === "down") return "↓";
      if (lower === "left") return "←";
      if (lower === "right") return "→";

      return key.charAt(0).toUpperCase() + key.slice(1);
    })
    .join(isMac ? " " : " + ");
}
