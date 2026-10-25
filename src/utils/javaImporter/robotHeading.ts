// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Turns exported fromRobotHeading(...) wrappers back into plain interpolators
// starting from the follower's heading, which the reader reads as Prev.

export const ROBOT_HEADING = "follower.pose().heading()";

function closeOf(text: string, from: number, open: string, close: string) {
  let depth = 1;
  for (let i = from; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close && --depth === 0) return i;
  }
  return -1;
}

const CALL = /fromRobotHeading\(\s*follower\s*(?:,|\)\s*\{)\s*(\w+)\s*->\s*/g;

export function unwrapRobotHeading(source: string): string {
  let result = "";
  let last = 0;
  for (const match of source.matchAll(CALL)) {
    const at = match.index!;
    if (/(?:Interpolator|fun)\s+$/.test(source.slice(0, at))) continue;
    // Kotlin passes the lambda after the parentheses; Java inside them.
    const kotlin = match[0].includes("{");
    const bodyStart = at + match[0].length;
    const end = kotlin
      ? closeOf(source, bodyStart, "{", "}")
      : closeOf(source, bodyStart, "(", ")");
    if (end < 0 || at < last) continue;

    const body = source
      .slice(bodyStart, end)
      .replace(new RegExp(`\\b${match[1]}\\b`, "g"), ROBOT_HEADING);
    result += source.slice(last, at) + body;
    last = end + 1;
  }
  return result + source.slice(last);
}
