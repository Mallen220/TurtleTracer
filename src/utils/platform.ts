// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
export const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPod|iPhone|iPad/.test(navigator.platform);
export const modKey = isMac ? "Cmd" : "Ctrl";
export const altKey = isMac ? "Opt" : "Alt";
