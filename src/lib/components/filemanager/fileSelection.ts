// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Which files are selected in the file manager. The primary is the first file
// clicked; `others` are the paths added with Shift or Ctrl/Cmd.
import type { FileInfo } from "../../../types";
import { isSupportedProjectFileName } from "../../../utils/fileExtensions";

export interface Selection {
  primary: FileInfo | null;
  others: string[];
}

export const NO_SELECTION: Selection = { primary: null, others: [] };

/** Only project files can be selected together; a folder or Java file is always alone. */
export const isSelectable = (f: FileInfo) =>
  !f.isDirectory && isSupportedProjectFileName(f.name);

/** `order` is every file in the order the view shows them. */
export function clickSelect(
  sel: Selection,
  file: FileInfo,
  order: FileInfo[],
  mods: { shift?: boolean; toggle?: boolean },
): Selection {
  const alone: Selection = { primary: file, others: [] };
  const { primary } = sel;
  if (!(mods.shift || mods.toggle) || !primary) return alone;
  if (!isSelectable(file) || !isSelectable(primary)) return alone;

  if (mods.shift) {
    const a = order.findIndex((f) => f.path === primary.path);
    const b = order.findIndex((f) => f.path === file.path);
    if (a < 0 || b < 0) return alone;
    const range = order.slice(Math.min(a, b), Math.max(a, b) + 1);
    return {
      primary,
      others: range
        .filter((f) => isSelectable(f) && f.path !== primary.path)
        .map((f) => f.path),
    };
  }

  // Ctrl/Cmd-click toggles one file.
  if (file.path === primary.path) {
    // The earliest remaining file in display order takes over as primary.
    const next = order.find((f) => sel.others.includes(f.path));
    return next
      ? { primary: next, others: sel.others.filter((p) => p !== next.path) }
      : NO_SELECTION;
  }
  return {
    primary,
    others: sel.others.includes(file.path)
      ? sel.others.filter((p) => p !== file.path)
      : [...sel.others, file.path],
  };
}

/** Ctrl/Cmd+A: every project file shown, keeping the primary if there is one. */
export function selectAllIn(sel: Selection, order: FileInfo[]): Selection {
  const all = order.filter(isSelectable);
  const primary =
    sel.primary && isSelectable(sel.primary) ? sel.primary : (all[0] ?? null);
  if (!primary) return sel;
  return {
    primary,
    others: all.filter((f) => f.path !== primary.path).map((f) => f.path),
  };
}

/** Everything selected: the primary first, then the rest in display order. */
export function selectedFiles(sel: Selection, order: FileInfo[]): FileInfo[] {
  if (!sel.primary) return [];
  const rest = order.filter(
    (f) => sel.others.includes(f.path) && f.path !== sel.primary!.path,
  );
  return [sel.primary, ...rest];
}

/** Drops selected files that are no longer listed. */
export function pruneSelection(sel: Selection, files: FileInfo[]): Selection {
  const listed = new Set(files.map((f) => f.path));
  const others = sel.others.filter((p) => listed.has(p));
  return others.length === sel.others.length ? sel : { ...sel, others };
}

/**
 * A rubber-band drag: `hits` replaces the selection, or with `additive` is
 * added to `base`, the selection from before the drag started.
 */
export function rubberSelect(
  base: Selection,
  hits: FileInfo[],
  additive: boolean,
): Selection {
  const items = hits.filter(isSelectable);
  const keep = additive && base.primary ? base : NO_SELECTION;
  const primary = keep.primary ?? items[0] ?? null;
  if (!primary) return NO_SELECTION;
  const others = new Set(keep.others);
  for (const f of items) if (f.path !== primary.path) others.add(f.path);
  return { primary, others: [...others] };
}
