// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Lays out generated Kotlin. Prettier has no maintained Kotlin plugin, and
// the generator already writes one statement or argument per line, so this
// only has to re-indent: it never moves code between lines.

const INDENT = "    ";

/** What a line holds once its strings and comments are understood. */
interface ScannedLine {
  /** The line with `$` escaped in strings and a trailing `;` dropped. */
  text: string;
  /** Its brackets outside strings and comments, in order. */
  brackets: string;
  /** Whether the line ends inside a block comment. */
  inComment: boolean;
}

const OPENERS = "([{";

/**
 * Reads one line. Strings never span lines in generated code; block
 * comments (the banner) do, so whether one is open is carried over.
 */
function scanLine(line: string, inComment: boolean): ScannedLine {
  let text = "";
  let brackets = "";
  // Where the code ends, before a trailing line comment.
  let codeEnd = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (inComment) {
      text += c;
      if (c === "*" && line[i + 1] === "/") {
        text += "/";
        i++;
        inComment = false;
      }
      continue;
    }
    if (inString) {
      // Kotlin would read `$name` in a string as a template.
      if (escaped) {
        text += c;
        escaped = false;
      } else if (c === "\\") {
        text += c;
        escaped = true;
      } else if (c === '"') {
        text += c;
        inString = false;
        codeEnd = text.length;
      } else {
        text += c === "$" ? String.raw`\$` : c;
      }
      continue;
    }
    if (c === "/" && line[i + 1] === "/") {
      text += line.slice(i);
      break;
    }
    if (c === "/" && line[i + 1] === "*") {
      text += "/*";
      i++;
      inComment = true;
      continue;
    }
    if (c === '"') {
      text += c;
      inString = true;
      continue;
    }
    if ("()[]{}".includes(c)) brackets += c;
    text += c;
    if (c !== " " && c !== "\t") codeEnd = text.length;
  }
  if (inString) {
    // A string left open is closed where the line ends.
    text += '"';
    codeEnd = text.length;
  }

  // Semicolons end statements in Java; Kotlin lets a line end do it.
  if (codeEnd > 0 && text[codeEnd - 1] === ";") {
    text = text.slice(0, codeEnd - 1) + text.slice(codeEnd);
  }
  return { text: text.trim(), brackets, inComment };
}

/** Generated Kotlin with four-space indents, single blank lines and no semicolons at line ends. */
export function formatKotlin(source: string): string {
  const out: string[] = [];
  // The indent level of the line each open bracket is on.
  const open: number[] = [];
  let inComment = false;

  for (const raw of source.split("\n")) {
    const startsInComment = inComment;
    const scanned = scanLine(raw.trim(), inComment);
    inComment = scanned.inComment;
    const { text, brackets } = scanned;

    if (text === "") {
      // One blank line at most, and none just inside a bracket.
      const previous = out.at(-1);
      if (previous !== undefined && previous !== "" && !/[([{]$/.test(previous))
        out.push("");
      continue;
    }

    // A line that starts by closing brackets lines up with the line that
    // opened the outermost of them. Other lines go one in from the
    // innermost open bracket's line, and a chained call one further.
    const closers = /^[)\]}]*/.exec(text.replaceAll(/\s/g, ""))![0].length;
    let level: number;
    if (closers > 0 && open.length > 0) {
      level = open[Math.max(0, open.length - closers)]!;
    } else {
      level = open.length > 0 ? open.at(-1)! + 1 : 0;
      if (/^(\?\.|\.)[A-Za-z_]/.test(text)) level++;
    }
    // Block comment lines after the first line up their stars.
    const prefix = startsInComment && text.startsWith("*") ? " " : "";

    if (closers > 0 && out.at(-1) === "") out.pop();
    out.push(INDENT.repeat(level) + prefix + text);
    for (const b of brackets) {
      if (OPENERS.includes(b)) open.push(level);
      else open.pop();
    }
  }

  while (out[0] === "") out.shift();
  while (out.at(-1) === "") out.pop();
  return `${out.join("\n")}\n`;
}
