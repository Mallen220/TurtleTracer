// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import hljs from "highlight.js/lib/core";
import java from "highlight.js/lib/languages/java";
import kotlin from "highlight.js/lib/languages/kotlin";

// Ensure Java and Kotlin are registered
if (!hljs.getLanguage("java")) {
  hljs.registerLanguage("java", java);
}
if (!hljs.getLanguage("kotlin")) {
  hljs.registerLanguage("kotlin", kotlin);
}

/**
 * Highlights code and splits it into lines, ensuring that any HTML tags (like spans for colors)
 * that span across newlines are correctly closed at the end of the line and reopened at the start of the next.
 *
 * @param code The source code to highlight
 * @param language The language to use (default: 'java')
 * @returns Array of HTML strings, one per line
 */
export function highlightAndSplit(
  code: string,
  language: string = "java",
): string[] {
  if (!code) return [];

  const highlighted = hljs.highlight(code, { language }).value;

  const lines: string[] = [];
  const openTags: string[] = [];
  let currentLine = "";

  // Regex to match tags or newlines
  // Capturing group keeps the delimiter in the result for split
  const tokens = highlighted.split(/(<\/?span[^>]*>|\n)/g);

  for (const token of tokens) {
    if (token === "\n") {
      // Close all open tags
      for (let i = openTags.length - 1; i >= 0; i--) {
        currentLine += "</span>";
      }
      lines.push(currentLine);

      // Start new line
      currentLine = "";
      // Re-open all tags
      for (const tag of openTags) {
        currentLine += tag;
      }
    } else if (token.startsWith("<span")) {
      openTags.push(token);
      currentLine += token;
    } else if (token === "</span>") {
      openTags.pop();
      currentLine += token;
    } else if (token !== "") {
      // Text content or empty string (split artifact)
      currentLine += token;
    }
  }

  // Push the last line
  lines.push(currentLine);

  return lines;
}

// Theme classes whose colors differ the most; each pose line cycles through them.
const POSE_CLASSES = [
  "hljs-keyword",
  "hljs-string",
  "hljs-number",
  "hljs-type",
];

/** One HTML string per line of a points export, each pose line in the next color. */
export function highlightPoints(code: string): string[] {
  let pose = 0;
  return code.split("\n").map((raw) => {
    // Escaped because the Code tab can pass other formats' code through here.
    const line = raw
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    if (!line.trim().startsWith("(")) return line;
    return `<span class="${POSE_CLASSES[pose++ % POSE_CLASSES.length]}">${line}</span>`;
  });
}
