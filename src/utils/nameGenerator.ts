// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line } from "../types";

export const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function renumberDefaultPathNames(lines: Line[]): Line[] {
  return lines.map((l, idx) => {
    if (/^Path \d+$/.test(l.name || "")) {
      return { ...l, name: `Path ${idx + 1}` };
    }
    return l;
  });
}

/**
 * Generates a unique name based on a base name and a list of existing names.
 * Used for duplicating items to avoid "Copy of Copy of Name".
 *
 * Example:
 * "MyPath" -> "MyPath duplicate"
 * "MyPath duplicate" -> "MyPath duplicate 1"
 * "MyPath duplicate 1" -> "MyPath duplicate 2"
 */
export function generateName(
  baseName: string,
  existingNames: string[],
): string {
  const normalize = (n: string) => n.trim().toLowerCase();
  const existingSet = new Set(existingNames.map(normalize));

  if (!existingSet.has(normalize(baseName))) {
    return baseName;
  }

  const match = baseName.match(/ duplicate(?: (\d+))?$/);
  const coreName = match ? baseName.replace(/ duplicate(?: \d+)?$/, "") : baseName;
  let i = match ? (match[1] ? parseInt(match[1], 10) + 1 : 1) : 0;

  while (true) {
    const candidate = i === 0 ? `${coreName} duplicate` : `${coreName} duplicate ${i}`;
    if (!existingSet.has(normalize(candidate))) return candidate;
    i++;
  }
}
