// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
// Java source as tokens, and a parser for the expressions path code is made
// of: numbers, names, field access, method calls, `new`, arithmetic and
// lambdas. Statements aren't parsed; the reader finds what it needs by name.

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

const isNameStart = (c: string) => /[A-Za-z_$]/.test(c);
const isNamePart = (c: string) => /[\w$]/.test(c);
const isDigit = (c: string) => c >= "0" && c <= "9";

/** Splits Java source into tokens, leaving out whitespace and comments. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let line = 1;
  let i = 0;
  const push = (kind: Token["kind"], text: string) =>
    tokens.push({ kind, text, line });

  while (i < source.length) {
    const c = source[i]!;
    if (c === "\n") {
      line++;
      i++;
    } else if (/\s/.test(c)) {
      i++;
    } else if (source.startsWith("//", i)) {
      while (i < source.length && source[i] !== "\n") i++;
    } else if (source.startsWith("/*", i)) {
      const end = source.indexOf("*/", i + 2);
      const stop = end === -1 ? source.length : end + 2;
      for (let j = i; j < stop; j++) if (source[j] === "\n") line++;
      i = stop;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      let text = "";
      while (j < source.length && source[j] !== c && source[j] !== "\n") {
        if (source[j] === "\\") j++;
        text += source[j] ?? "";
        j++;
      }
      push("string", text);
      i = j + 1;
    } else if (isDigit(c) || (c === "." && isDigit(source[i + 1] ?? ""))) {
      const match =
        /^(?:\d[\d_]*)?(?:\.\d[\d_]*)?(?:[eE][+-]?\d+)?[dDfFlL]?/.exec(
          source.slice(i),
        )!;
      const text = match[0] || c;
      push("number", text.replaceAll("_", "").replace(/[dDfFlL]$/, ""));
      i += text.length;
    } else if (isNameStart(c)) {
      let j = i + 1;
      while (j < source.length && isNamePart(source[j]!)) j++;
      push("name", source.slice(i, j));
      i = j;
    } else {
      const symbol = SYMBOLS.find((s) => source.startsWith(s, i)) ?? c;
      push("symbol", symbol);
      i += symbol.length;
    }
  }
  return tokens;
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
      then: Expr;
      otherwise: Expr;
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

/** Reads expressions from `tokens`, starting wherever it's asked to. */
export class ExpressionParser {
  constructor(private readonly tokens: Token[]) {}

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

  private expression(at: { i: number }, minPrecedence: number): Expr {
    let left = this.unary(at);
    for (;;) {
      const t = this.peek(at);
      if (t?.kind !== "symbol") break;
      if (t.text === "?" && minPrecedence === 0) {
        at.i++;
        const then = this.expression(at, 0);
        if (this.peek(at)?.text === ":") at.i++;
        const otherwise = this.expression(at, 0);
        left = {
          kind: "conditional",
          test: left,
          then,
          otherwise,
          line: t.line,
        };
        continue;
      }
      const precedence = PRECEDENCE[t.text];
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
    if (t.kind === "name" && t.text === "new") {
      at.i++;
      let type = "";
      while (this.peek(at)?.kind === "name" || this.peek(at)?.text === ".") {
        type = this.peek(at)!.text === "." ? "" : this.peek(at)!.text;
        at.i++;
      }
      // Type arguments: new ArrayList<>()
      if (this.peek(at)?.text === "<") {
        let depth = 0;
        do {
          const s = this.peek(at)?.text;
          if (s === "<") depth++;
          if (s === ">") depth--;
          if (s === ">>") depth -= 2;
          at.i++;
        } while (depth > 0 && at.i < this.tokens.length);
      }
      if (this.peek(at)?.text !== "(") return { kind: "other", line };
      const open = at.i;
      at.i = this.closing(open) + 1;
      // An anonymous class body.
      if (this.peek(at)?.text === "{") at.i = this.closing(at.i) + 1;
      return { kind: "new", type, args: this.args(open), line };
    }
    if (t.kind === "name") {
      at.i++;
      // A lambda with one parameter: x -> ...
      if (this.peek(at)?.text === "->") return this.skipLambda(at, line);
      return { kind: "name", name: t.text, line };
    }
    if (t.text === "(") {
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
    at.i++;
    return { kind: "other", line };
  }

  /** Steps over a lambda's body (after `->`): a block or one expression. */
  private skipLambda(at: { i: number }, line: number): Expr {
    at.i++; // ->
    if (this.peek(at)?.text === "{") at.i = this.closing(at.i) + 1;
    else this.expression(at, 0);
    return { kind: "other", line };
  }

  private postfix(at: { i: number }, expr: Expr): Expr {
    for (;;) {
      const t = this.peek(at);
      if (t?.text === "." && this.tokens[at.i + 1]?.kind === "name") {
        const name = this.tokens[at.i + 1]!.text;
        at.i += 2;
        expr = { kind: "member", object: expr, name, line: t.line };
      } else if (t?.text === "(") {
        const open = at.i;
        at.i = this.closing(open) + 1;
        expr = {
          kind: "call",
          callee: expr,
          args: this.args(open),
          line: t.line,
        };
      } else if (t?.text === "[") {
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
