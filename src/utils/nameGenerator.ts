// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line } from "../types";

export const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

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

  // Check if it already has " duplicate N" or " duplicate" suffix
  // Regex to match " duplicate" or " duplicate <number>" at the end
  const duplicateRegex = / duplicate(?: (\d+))?$/;
  const match = baseName.match(duplicateRegex);

  let coreName = baseName;
  let currentNum = 0;

  if (match) {
    // It already has the suffix
    coreName = baseName.replace(duplicateRegex, "");
    if (match[1]) {
      currentNum = parseInt(match[1], 10);
    } else {
      // " duplicate" implies number 0 (conceptually, next is 1)
      currentNum = 0;
    }
  }


  let candidate = "";



  if (match) {

    let i = currentNum + 1;
    while (true) {
      candidate = `${coreName} duplicate ${i}`;
      if (!existingSet.has(normalize(candidate))) return candidate;
      i++;
    }
  } else {
    // First duplication
    candidate = `${baseName} duplicate`;
    if (!existingSet.has(normalize(candidate))) return candidate;

    let i = 1;
    while (true) {
      candidate = `${baseName} duplicate ${i}`;
      if (!existingSet.has(normalize(candidate))) return candidate;
      i++;
    }
  }
}
