// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
/** What a file's Git status means, for a tooltip. */
export function gitStatusTitle(status: string | undefined): string {
  if (status === "modified") return "Git: Modified (Unstaged Changes)";
  if (status === "staged") return "Git: Staged (Ready to Commit)";
  return "Git: Untracked (New File)";
}
