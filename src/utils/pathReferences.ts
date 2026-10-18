// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import type { Line, SequenceItem } from "../types";

/**
 * Whether the sequence and the list of paths agree: the ids of paths the
 * sequence leaves out, and of path steps that point at a path that isn't there.
 */
export function pathReferenceProblems(
  lines: Line[],
  sequence: SequenceItem[],
): { missing: string[]; invalid: string[] } {
  const lineIds = Array.isArray(lines)
    ? lines.map((l) => l.id).filter((id): id is string => id != null)
    : [];
  const sequenceIds = Array.isArray(sequence)
    ? sequence.flatMap((s) => (s.kind === "path" ? [s.lineId] : []))
    : [];
  return {
    missing: lineIds.filter((id) => id && !sequenceIds.includes(id)),
    invalid: sequenceIds.filter((id) => id && !lineIds.includes(id)),
  };
}
