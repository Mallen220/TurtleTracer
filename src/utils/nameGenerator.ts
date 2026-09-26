// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line } from "../types";

/** A short unique id, e.g. makeId("line") -> "line-m1x2y3-4k9d2f". */
export function makeId(prefix?: string): string {
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  return prefix ? `${prefix}-${id}` : id;
}

export function renumberDefaultPathNames(lines: Line[]): Line[] {
  return lines.map((l, idx) => {
    // Only renumber explicit default-style names like "Path 5". Preserve empty names.
    if (/^Path \d+$/.test(l.name || "")) {
      return { ...l, name: `Path ${idx + 1}` };
    }
    return l;
  });
}

/**
 * Returns `baseName` if nobody is using it yet, otherwise the next free
 * "duplicate" name (case-insensitive):
 *   "MyPath" -> "MyPath duplicate" -> "MyPath duplicate 1" -> "MyPath duplicate 2"
 */
export function generateName(
  baseName: string,
  existingNames: string[],
): string {
  const normalize = (n: string) => n.trim().toLowerCase();
  const taken = new Set(existingNames.map(normalize));
  const isFree = (name: string) => !taken.has(normalize(name));

  if (isFree(baseName)) return baseName;

  // Copying "MyPath duplicate 3" keeps counting from 3.
  const match = baseName.match(/^(.*) duplicate(?: (\d+))?$/);
  const root = match ? match[1] : baseName;
  if (!match && isFree(`${root} duplicate`)) return `${root} duplicate`;

  let n = match ? Number(match[2] ?? 0) + 1 : 1;
  while (!isFree(`${root} duplicate ${n}`)) n++;
  return `${root} duplicate ${n}`;
}
