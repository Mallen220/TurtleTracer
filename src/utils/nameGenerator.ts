// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
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

  // If the base name doesn't exist, return it (though usually this function is called for duplication)
  // For duplication, we usually want to append something.
  // But if we just want a unique name:
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

  // Try " duplicate" (implicitly 0) if we stripped it, or increment
  // Actually, standard pattern:
  // "Name" -> "Name duplicate"
  // "Name duplicate" -> "Name duplicate 1"
  // "Name duplicate 1" -> "Name duplicate 2"

  let candidate = "";

  // If we extracted a core name, we want to find the next available slot
  // If the original was "Name", we start checking "Name duplicate", "Name duplicate 1"...
  // If the original was "Name duplicate", core is "Name", start checking "Name duplicate 1"...

  if (match) {
    // We are duplicating a duplicate. Start looking from currentNum + 1
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
