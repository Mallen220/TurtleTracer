// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Java or Kotlin source as tokens, and a parser for the expressions path code
// is made of: numbers, names, field access, method calls, `new`, arithmetic
// and lambdas. Statements aren't parsed; the reader finds what it needs by name.

/** The languages the reader understands. */
export type SourceLanguage = "java" | "kotlin";

export interface Token {
  kind: "name" | "number" | "string" | "symbol";
  text: string;
  /** 1-based line in the source. */
  line: number;
}

const SYMBOLS = [
  ">>>=",
  "<<=",
  ">>=",
  ">>>",
  "...",
  "->",
  "::",
  "==",
  "!=",
  "<=",
  ">=",
  "&&",
  "||",
  "++",
  "--",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "&=",
  "|=",
  "^=",
  "<<",
  ">>",
];

/** Kotlin's own operators, checked before the ones it shares with Java. */
const KOTLIN_SYMBOLS = ["..<", "?.", "?:", "!!", ".."];

const isNameStart = (c: string) => /[A-Za-z_$]/.test(c);
const isNamePart = (c: string) => /[\w$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

/** Index just after the line comment at `i`: the end of the line. */
function endOfLineComment(source: string, i: number): number {
  while (i < source.length && source[i] !== "\n") i++;
  return i;
}

/**
 * Index just after the block comment at `i`, or the end of the source if it
 * isn't closed. Kotlin's block comments nest; Java's don't.
 */
function endOfBlockComment(
  source: string,
  i: number,
  language: SourceLanguage,
): number {
  if (language === "java") {
    const end = source.indexOf("*/", i + 2);
    return end === -1 ? source.length : end + 2;
  }
  let depth = 0;
  for (let j = i; j < source.length - 1; j++) {
    if (source.startsWith("/*", j)) {
      depth++;
      j++;
    } else if (source.startsWith("*/", j)) {
      depth--;
      j++;
      if (depth === 0) return j + 1;
    }
  }
  return source.length;
}

/** Kotlin's `"""raw string"""` at `start`, which can span lines. */
function readRawString(source: string, start: number) {
  const end = source.indexOf('"""', start + 3);
  const stop = end === -1 ? source.length : end;
  const text = source.slice(start + 3, stop);
  return {
    text,
    lines: text.split("\n").length - 1,
    next: end === -1 ? stop : stop + 3,
    closed: end !== -1,
  };
}

/**
 * The string or character literal that starts at `start` (on its quote), with
 * escapes resolved, and the index to carry on from. A literal that isn't
 * closed ends at the end of its line.
 */
function readLiteral(
  source: string,
  start: number,
): { text: string; next: number; closed: boolean } {
  const quote = source[start];
  let j = start + 1;
  let text = "";
  while (j < source.length && source[j] !== quote && source[j] !== "\n") {
    if (source[j] === "\\") j++;
    text += source[j] ?? "";
    j++;
  }
  const closed = source[j] === quote;
  // An unclosed literal leaves the line break to be counted.
  return { text, next: closed ? j + 1 : j, closed };
}

/** The number at `i` as written (`1_000`, `3f`), and as its digits alone. */
function readNumber(source: string, i: number): { raw: string; text: string } {
  const match = /^(?:\d[\d_]*)?(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[dDfFlL]?/.exec(
    source.slice(i),
  )!;
  const raw = match[0] || source[i]!;
  return { raw, text: raw.replaceAll("_", "").replace(/[dDfFlL]$/, "") };
}

/** What was found at a position in the source: a token (if any), how many lines it spanned and where to carry on. */
interface Scanned {
  token?: { kind: Token["kind"]; text: string };
  lines?: number;
  next: number;
  /** A string or block comment that's never closed. */
  unclosed?: boolean;
}

/** Steps over whitespace and comments, if that's what starts at `i`. */
function skipOver(
  source: string,
  i: number,
  language: SourceLanguage,
): Scanned | null {
  const c = source[i]!;
  if (c === "\n") return { lines: 1, next: i + 1 };
  if (/\s/.test(c)) return { next: i + 1 };
  if (source.startsWith("//", i)) return { next: endOfLineComment(source, i) };
  if (source.startsWith("/*", i)) {
    const stop = endOfBlockComment(source, i, language);
    let lines = 0;
    for (let j = i; j < stop; j++) if (source[j] === "\n") lines++;
    const unclosed = !source.slice(i + 2, stop).endsWith("*/");
    return { lines, next: stop, unclosed };
  }
  return null;
}

/** Reads the token that starts at `i`: a literal, number, name or symbol. */
function readToken(
  source: string,
  i: number,
  language: SourceLanguage,
): Scanned {
  const c = source[i]!;
  if (language === "kotlin" && source.startsWith('"""', i)) {
    const raw = readRawString(source, i);
    return {
      token: { kind: "string", text: raw.text },
      lines: raw.lines,
      next: raw.next,
      unclosed: !raw.closed,
    };
  }
  if (c === '"' || c === "'") {
    const literal = readLiteral(source, i);
    return {
      token: { kind: "string", text: literal.text },
      next: literal.next,
      unclosed: !literal.closed,
    };
  }
  if (isDigit(c) || (c === "." && isDigit(source[i + 1] ?? ""))) {
    const number = readNumber(source, i);
    return {
      token: { kind: "number", text: number.text },
      next: i + number.raw.length,
    };
  }
  if (isNameStart(c)) {
    let j = i + 1;
    while (j < source.length && isNamePart(source[j]!)) j++;
    return { token: { kind: "name", text: source.slice(i, j) }, next: j };
  }
  const symbols =
    language === "kotlin" ? [...KOTLIN_SYMBOLS, ...SYMBOLS] : SYMBOLS;
  const symbol = symbols.find((s) => source.startsWith(s, i)) ?? c;
  return { token: { kind: "symbol", text: symbol }, next: i + symbol.length };
}

/** Reads whatever starts at `i`, which is never past the end of `source`. */
const scan = (source: string, i: number, language: SourceLanguage): Scanned =>
  skipOver(source, i, language) ?? readToken(source, i, language);

/** Everything in the source in order, each with the line it starts on. */
function* scanAll(source: string, language: SourceLanguage) {
  let line = 1;
  let i = 0;
  while (i < source.length) {
    const scanned = scan(source, i, language);
    yield { scanned, line };
    line += scanned.lines ?? 0;
    i = scanned.next;
  }
}

/** Splits source into tokens, leaving out whitespace and comments. */
export function tokenize(
  source: string,
  language: SourceLanguage = "java",
): Token[] {
  const tokens: Token[] = [];
  for (const { scanned, line } of scanAll(source, language)) {
    // A token that spans lines (a raw string) is on the line it starts on.
    if (scanned.token) tokens.push({ ...scanned.token, line });
  }
  return tokens;
}

/** The line of the first string or block comment that's never closed, if any. */
export function unclosedLine(
  source: string,
  language: SourceLanguage = "java",
): number | null {
  for (const { scanned, line } of scanAll(source, language)) {
    if (scanned.unclosed) return line;
  }
  return null;
}

export type Expr =
  | { kind: "number"; value: number; line: number }
  | { kind: "string"; value: string; line: number }
  | { kind: "name"; name: string; line: number }
  | { kind: "member"; object: Expr; name: string; line: number }
  | { kind: "call"; callee: Expr; args: Expr[]; line: number }
  | { kind: "new"; type: string; args: Expr[]; line: number }
  | { kind: "unary"; op: string; operand: Expr; line: number }
  | { kind: "binary"; op: string; left: Expr; right: Expr; line: number }
  | {
      kind: "conditional";
      test: Expr;
      whenTrue: Expr;
      whenFalse: Expr;
      line: number;
    }
  /** Anything the reader has no use for, such as a lambda. */
  | { kind: "other"; line: number };

const PRECEDENCE: Record<string, number> = {
  "||": 1,
  "&&": 2,
  "==": 3,
  "!=": 3,
  "<": 4,
  ">": 4,
  "<=": 4,
  ">=": 4,
  "+": 5,
  "-": 5,
  "*": 6,
  "/": 6,
  "%": 6,
};

/** Kotlin's elvis operator, `a ?: b`, binds less tightly than everything above. */
const KOTLIN_PRECEDENCE: Record<string, number> = { ...PRECEDENCE, "?:": 0.5 };

/** Whether a call on `name` alone constructs a class, as Kotlin writes `new X(...)`. */
const isClassName = (name: string) => /^[A-Z]/.test(name);

/**
 * Reads expressions from `tokens`, starting wherever it's asked to.
 *
 * Kotlin has no `new` and no semicolons: a call on a class name constructs
 * it, and a line break ends an expression unless what follows can only
 * continue it (`.member`, `?:`, `&&`, ...).
 */
export class ExpressionParser {
  private readonly kotlin: boolean;

  constructor(
    private readonly tokens: Token[],
    language: SourceLanguage = "java",
  ) {
    this.kotlin = language === "kotlin";
  }

  /** Index of the token that closes the bracket at `open`, or the end. */
  closing(open: number): number {
    const pairs: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
    const stack: string[] = [];
    for (let i = open; i < this.tokens.length; i++) {
      const t = this.tokens[i]!.text;
      if (this.tokens[i]!.kind !== "symbol") continue;
      if (pairs[t]) stack.push(pairs[t]);
      else if (t === stack.at(-1)) {
        stack.pop();
        if (stack.length === 0) return i;
      }
    }
    return this.tokens.length;
  }

  /** The expression starting at `start`, and the index just after it. */
  parse(start: number): { expr: Expr; end: number } {
    const at = { i: start };
    const expr = this.expression(at, 0);
    return { expr, end: at.i };
  }

  /** The arguments in the brackets at `open`. */
  args(open: number): Expr[] {
    const close = this.closing(open);
    const args: Expr[] = [];
    let i = open + 1;
    while (i < close) {
      // Kotlin's named arguments: `x = 1.0`.
      if (this.kotlin && this.tokens[i + 1]?.text === "=") i += 2;
      const { expr, end } = this.parse(i);
      args.push(expr);
      i = end;
      // Skip anything unparsed up to the next argument.
      while (i < close && this.tokens[i]!.text !== ",") i++;
      i++;
    }
    return args;
  }

  private peek(at: { i: number }) {
    return this.tokens[at.i];
  }

  /** Whether the token at `at` starts a new line, which in Kotlin can end an expression. */
  private onNewLine(at: { i: number }) {
    const before = this.tokens[at.i - 1];
    return this.kotlin && !!before && this.tokens[at.i]!.line > before.line;
  }

  private expression(at: { i: number }, minPrecedence: number): Expr {
    let left = this.unary(at);
    for (;;) {
      const t = this.peek(at);
      if (t?.kind !== "symbol") break;
      // In Kotlin `a` then `-b` on the next line are two statements.
      if ((t.text === "-" || t.text === "+") && this.onNewLine(at)) break;
      if (t.text === "?" && minPrecedence === 0 && !this.kotlin) {
        at.i++;
        const whenTrue = this.expression(at, 0);
        if (this.peek(at)?.text === ":") at.i++;
        const whenFalse = this.expression(at, 0);
        left = {
          kind: "conditional",
          test: left,
          whenTrue,
          whenFalse,
          line: t.line,
        };
        continue;
      }
      const precedence = (this.kotlin ? KOTLIN_PRECEDENCE : PRECEDENCE)[t.text];
      if (precedence === undefined || precedence <= minPrecedence) break;
      at.i++;
      const right = this.expression(at, precedence);
      left = { kind: "binary", op: t.text, left, right, line: t.line };
    }
    return left;
  }

  private unary(at: { i: number }): Expr {
    const t = this.peek(at);
    if (
      t?.kind === "symbol" &&
      (t.text === "-" || t.text === "+" || t.text === "!")
    ) {
      at.i++;
      return {
        kind: "unary",
        op: t.text,
        operand: this.unary(at),
        line: t.line,
      };
    }
    return this.postfix(at, this.primary(at));
  }

  private primary(at: { i: number }): Expr {
    const t = this.peek(at);
    if (!t) return { kind: "other", line: this.tokens.at(-1)?.line ?? 1 };
    const line = t.line;
    if (t.kind === "number") {
      at.i++;
      return { kind: "number", value: Number.parseFloat(t.text), line };
    }
    if (t.kind === "string") {
      at.i++;
      return { kind: "string", value: t.text, line };
    }
    if (t.kind === "name" && t.text === "new")
      return this.construction(at, line);
    if (t.kind === "name") {
      at.i++;
      // A lambda with one parameter: x -> ...
      if (this.peek(at)?.text === "->") return this.skipLambda(at, line);
      return { kind: "name", name: t.text, line };
    }
    if (t.text === "(") return this.parenthesized(at, line);
    // A Kotlin lambda, `{ ... }`.
    if (t.text === "{" && this.kotlin) {
      at.i = this.closing(at.i) + 1;
      return { kind: "other", line };
    }
    at.i++;
    return { kind: "other", line };
  }

  /** `new Type<...>(args) { body }`, from the `new`. */
  private construction(at: { i: number }, line: number): Expr {
    at.i++;
    let type = "";
    while (this.peek(at)?.kind === "name" || this.peek(at)?.text === ".") {
      type = this.peek(at)!.text === "." ? "" : this.peek(at)!.text;
      at.i++;
    }
    this.skipTypeArguments(at);
    if (this.peek(at)?.text !== "(") return { kind: "other", line };
    const open = at.i;
    at.i = this.closing(open) + 1;
    // An anonymous class body.
    if (this.peek(at)?.text === "{") at.i = this.closing(at.i) + 1;
    return { kind: "new", type, args: this.args(open), line };
  }

  /** Steps over type arguments such as `<>` or `<String, List<Integer>>`. */
  private skipTypeArguments(at: { i: number }) {
    if (this.peek(at)?.text !== "<") return;
    let depth = 0;
    do {
      const s = this.peek(at)?.text;
      if (s === "<") depth++;
      if (s === ">") depth--;
      if (s === ">>") depth -= 2;
      at.i++;
    } while (depth > 0 && at.i < this.tokens.length);
  }

  /** A bracketed expression, a cast, or the start of a lambda, from the `(`. */
  private parenthesized(at: { i: number }, line: number): Expr {
    const close = this.closing(at.i);
    // A lambda: (...) -> ...
    if (this.tokens[close + 1]?.text === "->") {
      at.i = close + 1;
      return this.skipLambda(at, line);
    }
    // A cast, such as (double) x, keeps the value.
    const inner = this.tokens.slice(at.i + 1, close);
    if (
      inner.length === 1 &&
      inner[0]!.kind === "name" &&
      /^[a-z]/.test(inner[0]!.text) &&
      this.tokens[close + 1] &&
      this.tokens[close + 1]!.text !== "."
    ) {
      at.i = close + 1;
      return this.unary(at);
    }
    at.i++;
    const expr = this.expression(at, 0);
    at.i = close + 1;
    return expr;
  }

  /** Steps over a lambda's body (after `->`): a block or one expression. */
  private skipLambda(at: { i: number }, line: number): Expr {
    at.i++; // ->
    if (this.peek(at)?.text === "{") at.i = this.closing(at.i) + 1;
    else this.expression(at, 0);
    return { kind: "other", line };
  }

  /** A call of `callee` with the brackets at `open`, or in Kotlin a construction. */
  private callOf(callee: Expr, args: Expr[], line: number): Expr {
    if (this.kotlin && callee.kind === "name" && isClassName(callee.name)) {
      return { kind: "new", type: callee.name, args, line };
    }
    return { kind: "call", callee, args, line };
  }

  private postfix(at: { i: number }, expr: Expr): Expr {
    for (;;) {
      const t = this.peek(at);
      const member = t?.text === "." || (t?.text === "?." && this.kotlin);
      if (member && this.tokens[at.i + 1]?.kind === "name") {
        const name = this.tokens[at.i + 1]!.text;
        at.i += 2;
        expr = { kind: "member", object: expr, name, line: t.line };
      } else if (t?.text === "(" && !this.onNewLine(at)) {
        const open = at.i;
        at.i = this.closing(open) + 1;
        expr = this.callOf(expr, this.args(open), t.line);
      } else if (t?.text === "{" && this.kotlin && !this.onNewLine(at)) {
        // A trailing lambda: `InstantCommand { ... }`, `.setStart { ... }`.
        at.i = this.closing(at.i) + 1;
        if (expr.kind !== "call" && expr.kind !== "new") {
          expr = this.callOf(expr, [], t.line);
        }
      } else if (t?.text === "!!" && this.kotlin) {
        at.i++;
      } else if (t?.text === "as" && this.kotlin) {
        // A cast keeps the value: skip `as` / `as?` and the type.
        at.i++;
        if (this.peek(at)?.text === "?") at.i++;
        while (
          (this.peek(at)?.kind === "name" || this.peek(at)?.text === ".") &&
          !this.onNewLine(at)
        ) {
          at.i++;
        }
      } else if (t?.text === "[" && !this.onNewLine(at)) {
        at.i = this.closing(at.i) + 1;
        expr = { kind: "other", line: t.line };
      } else if (t?.text === "::") {
        at.i += 2;
        expr = { kind: "other", line: t.line };
      } else {
        return expr;
      }
    }
  }
}
