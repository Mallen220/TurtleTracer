// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { ExpressionParser, tokenize } from "./javaTokens";

const texts = (source: string) => tokenize(source).map((t) => t.text);
const kinds = (source: string) => tokenize(source).map((t) => t.kind);

/** The first expression in `source`, with line numbers left out. */
function parse(source: string) {
  const { expr } = new ExpressionParser(tokenize(source)).parse(0);
  return JSON.parse(
    JSON.stringify(expr, (k, v) => (k === "line" ? undefined : v)),
  );
}

describe("tokenize", () => {
  it("splits names, numbers and symbols", () => {
    expect(texts("Pose a = new Pose(1, 2.5);")).toEqual([
      "Pose",
      "a",
      "=",
      "new",
      "Pose",
      "(",
      "1",
      ",",
      "2.5",
      ")",
      ";",
    ]);
    expect(kinds("a = 1;")).toEqual(["name", "symbol", "number", "symbol"]);
  });

  it("reads numbers as Java writes them", () => {
    expect(texts("1_000 3f 7L 0.1d .5 1e3 1E-2")).toEqual([
      "1000",
      "3",
      "7",
      "0.1",
      ".5",
      "1e3",
      "1E-2",
    ]);
  });

  it("joins multi-character symbols, longest first", () => {
    expect(texts("a >>>= b -> c :: d <<= e ... f")).toEqual([
      "a",
      ">>>=",
      "b",
      "->",
      "c",
      "::",
      "d",
      "<<=",
      "e",
      "...",
      "f",
    ]);
    expect(texts("a >> b > c")).toEqual(["a", ">>", "b", ">", "c"]);
  });

  it("reads strings and characters, resolving escapes", () => {
    const tokens = tokenize(String.raw`"say \"hi\"" 'x' 'it\'s'`);
    expect(tokens.map((t) => [t.kind, t.text])).toEqual([
      ["string", 'say "hi"'],
      ["string", "x"],
      ["string", "it's"],
    ]);
  });

  it("ends a string that isn't closed at the end of its line", () => {
    expect(texts('"open\nnext')).toEqual(["open", "next"]);
  });

  it("leaves out comments and whitespace but keeps count of lines", () => {
    const tokens = tokenize("a // one\n/* two\nthree */ b\n\nc");
    expect(tokens.map((t) => [t.text, t.line])).toEqual([
      ["a", 1],
      ["b", 3],
      ["c", 5],
    ]);
  });

  it("treats a block comment that isn't closed as running to the end", () => {
    expect(texts("a /* never closed b c")).toEqual(["a"]);
  });

  it("keeps unknown characters as symbols", () => {
    expect(texts("a # b @ c")).toEqual(["a", "#", "b", "@", "c"]);
  });

  it("takes $ and _ as part of names", () => {
    expect(texts("_a $b c_1")).toEqual(["_a", "$b", "c_1"]);
  });
});

describe("ExpressionParser", () => {
  it("parses calls on members, with arguments", () => {
    expect(parse("Math.toRadians(90)")).toEqual({
      kind: "call",
      callee: {
        kind: "member",
        object: { kind: "name", name: "Math" },
        name: "toRadians",
      },
      args: [{ kind: "number", value: 90 }],
    });
  });

  it("respects operator precedence", () => {
    expect(parse("1 + 2 * 3")).toMatchObject({
      kind: "binary",
      op: "+",
      right: { kind: "binary", op: "*" },
    });
    expect(parse("(1 + 2) * 3")).toMatchObject({
      kind: "binary",
      op: "*",
      left: { kind: "binary", op: "+" },
    });
  });

  it("parses unary minus and conditionals", () => {
    expect(parse("-x")).toMatchObject({ kind: "unary", op: "-" });
    expect(parse("a ? b : c")).toMatchObject({
      kind: "conditional",
      test: { name: "a" },
      whenTrue: { name: "b" },
      whenFalse: { name: "c" },
    });
  });

  it("parses `new`, skipping type arguments and anonymous class bodies", () => {
    expect(parse("new Pose(1, 2)")).toMatchObject({
      kind: "new",
      type: "Pose",
    });
    expect(parse("new ArrayList<Map<String, Integer>>(3)")).toMatchObject({
      kind: "new",
      type: "ArrayList",
      args: [{ value: 3 }],
    });
    expect(parse("new Runnable() { void run() {} }")).toMatchObject({
      kind: "new",
      type: "Runnable",
    });
    expect(parse("new a.b.C(1)")).toMatchObject({ kind: "new", type: "C" });
  });

  it("makes `other` of lambdas, arrays and method references", () => {
    expect(parse("x -> x + 1")).toMatchObject({ kind: "other" });
    expect(parse("(a, b) -> { return a; }")).toMatchObject({ kind: "other" });
    expect(parse("arr[1]")).toMatchObject({ kind: "other" });
    expect(parse("Foo::bar")).toMatchObject({ kind: "other" });
  });

  it("looks through a cast", () => {
    expect(parse("(double) x")).toMatchObject({ kind: "name", name: "x" });
    expect(parse("(int) 5")).toMatchObject({ kind: "number", value: 5 });
  });

  it("finds the end of an expression and a call's arguments", () => {
    const parser = new ExpressionParser(tokenize("f(1, g(2, 3), 4) rest"));
    expect(parser.parse(0).end).toBe(13);
    expect(parser.closing(1)).toBe(12);
    expect(parser.args(1)).toHaveLength(3);
  });

  it("returns something for an empty or broken expression", () => {
    expect(parse("")).toMatchObject({ kind: "other" });
    expect(parse(") ]")).toMatchObject({ kind: "other" });
  });
});

describe("Kotlin", () => {
  const ktTexts = (source: string) =>
    tokenize(source, "kotlin").map((t) => t.text);
  const ktParse = (source: string) => {
    const { expr } = new ExpressionParser(
      tokenize(source, "kotlin"),
      "kotlin",
    ).parse(0);
    return JSON.parse(
      JSON.stringify(expr, (k, v) => (k === "line" ? undefined : v)),
    );
  };

  it("reads Kotlin's own operators, which Java splits up", () => {
    expect(ktTexts("a?.b ?: c!! 0..<5")).toEqual([
      "a",
      "?.",
      "b",
      "?:",
      "c",
      "!!",
      "0",
      "..<",
      "5",
    ]);
    expect(texts("a?.b")).toEqual(["a", "?", ".", "b"]);
  });

  it("skips nested comments and keeps raw strings whole", () => {
    expect(ktTexts("/* a /* b */ c */ x")).toEqual(["x"]);
    const tokens = tokenize('val s = """\nline(a, b)\n"""\ny', "kotlin");
    expect(tokens.map((t) => t.text)).toEqual([
      "val",
      "s",
      "=",
      "\nline(a, b)\n",
      "y",
    ]);
    expect(tokens.at(-1)!.line).toBe(4);
  });

  it("reads a call on a class name as constructing it", () => {
    expect(ktParse("Pose(1.0, 2.0)")).toMatchObject({
      kind: "new",
      type: "Pose",
      args: [{ value: 1 }, { value: 2 }],
    });
    expect(ktParse("line(a, b)")).toMatchObject({ kind: "call" });
    expect(parse("Pose(1.0, 2.0)")).toMatchObject({ kind: "call" });
  });

  it("treats trailing lambdas as calls and steps over them", () => {
    expect(ktParse("InstantCommand { follower.follow(p) }")).toMatchObject({
      kind: "new",
      type: "InstantCommand",
    });
    expect(ktParse("x.setStart { a() }.setIsDone { true }")).toMatchObject({
      kind: "call",
      callee: { name: "setIsDone" },
    });
    expect(ktParse("{ a -> a + 1 }")).toMatchObject({ kind: "other" });
  });

  it("ends an expression at a line break unless the next line continues it", () => {
    expect(ktParse("a\n(b)")).toMatchObject({ kind: "name", name: "a" });
    expect(ktParse("a\n-b")).toMatchObject({ kind: "name", name: "a" });
    expect(ktParse("a\n  .b()")).toMatchObject({ kind: "call" });
    expect(ktParse("a ?:\n b")).toMatchObject({ kind: "binary", op: "?:" });
    // Java has no such rule.
    expect(parse("a\n-b")).toMatchObject({ kind: "binary", op: "-" });
  });

  it("drops casts, !! and named argument names", () => {
    expect(ktParse("x!! as Double")).toMatchObject({ kind: "name", name: "x" });
    expect(ktParse("Pose(x = 1.0, y = 2.0)")).toMatchObject({
      args: [{ value: 1 }, { value: 2 }],
    });
  });
});
