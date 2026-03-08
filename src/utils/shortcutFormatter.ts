// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Settings } from "../types";
import { isMac } from "./platform";

export function getShortcutFromSettings(
  settings: Settings | undefined,
  actionId: string,
): string {
  if (!settings || !settings.keyBindings) return "";

  const binding = settings.keyBindings.find((b) => b.id === actionId);
  if (!binding) return "";

  // Get the first key in the list (comma separated)
  let key = binding.key.split(",")[0].trim();

  // Handle empty key
  if (!key) return "";

  const parts = key.split("+");

  const formattedParts = parts.map((part) => {
    const p = part.toLowerCase();

    if (isMac) {
      if (p === "cmd") return "⌘";
      if (p === "shift") return "⇧";
      if (p === "alt") return "⌥";
      if (p === "ctrl") return "⌃";
    } else {
      if (p === "cmd") return "Ctrl";
      if (p === "shift") return "Shift";
      if (p === "alt") return "Alt";
      if (p === "ctrl") return "Ctrl";
    }

    // Key content
    if (p.length === 1) return p.toUpperCase();
    // Special keys like 'space', 'enter', 'up' -> Capitalize
    return p.charAt(0).toUpperCase() + p.slice(1);
  });

  if (isMac) {
    // Mac style: usually no pluses, but space between logic?
    // Standard macOS menus: ⇧⌘S (no space).
    return ` (${formattedParts.join("")})`;
  } else {
    return ` (${formattedParts.join("+")})`;
  }
}
