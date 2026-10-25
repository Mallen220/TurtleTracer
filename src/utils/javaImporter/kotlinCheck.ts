// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// A light syntax check for followed Kotlin files. The app has no Kotlin
// parser, so a save is only held back when it's plainly half-written: a
// string, comment or bracket left open, or a bracket closed by the wrong one.
import { tokenize, unclosedLine } from "./javaTokens";
import type { ReadNote } from "./pedroReader";

const CLOSERS: Record<string, string> = { "(": ")", "[": "]", "{": "}" };

/** What's plainly unfinished in a Kotlin file, or null if nothing is. */
export function kotlinSyntaxProblem(source: string): ReadNote | null {
  const unclosed = unclosedLine(source, "kotlin");
  if (unclosed !== null) {
    return { line: unclosed, message: "This string or comment isn't closed." };
  }

  const open: { text: string; line: number }[] = [];
  for (const t of tokenize(source, "kotlin")) {
    if (t.kind !== "symbol") continue;
    if (CLOSERS[t.text]) {
      open.push(t);
      continue;
    }
    if (!Object.values(CLOSERS).includes(t.text)) continue;
    const opener = open.pop();
    if (!opener) {
      return { line: t.line, message: `This ${t.text} has nothing to close.` };
    }
    // Shown on the opening bracket's line, which is usually the one edited.
    if (t.text !== CLOSERS[opener.text]) {
      return {
        line: opener.line,
        message: `This ${opener.text} isn't closed before the ${t.text} on line ${t.line}.`,
      };
    }
  }
  const last = open.at(-1);
  return last
    ? { line: last.line, message: `This ${last.text} isn't closed.` }
    : null;
}
