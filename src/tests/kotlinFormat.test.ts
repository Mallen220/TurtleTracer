// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { formatKotlin } from "../lib/exporters/kotlinFormat";
import { kotlinSyntaxProblem } from "../utils/javaImporter/kotlinCheck";

describe("formatKotlin", () => {
  it("indents by bracket, four spaces a level, and lines closers up with their opener", () => {
    expect(
      formatKotlin(`
class A {
fun b() {
      val x = listOf(
  1,
      2,
)
}
}`),
    ).toBe(`class A {
    fun b() {
        val x = listOf(
            1,
            2,
        )
    }
}
`);
  });

  it("indents a chained call under its line, and closes back to the chained line", () => {
    expect(
      formatKotlin(`x = line(a, b)
.heading(Interpolator.piecewise()
.until(0.5, t)
)`),
    ).toBe(`x = line(a, b)
    .heading(Interpolator.piecewise()
            .until(0.5, t)
    )
`);
  });

  it("drops semicolons that end lines, but not ones in strings or comments", () => {
    expect(
      formatKotlin(`a();
b("x;"); // done;
c(); d();`),
    ).toBe(`a()
b("x;") // done;
c(); d()
`);
  });

  it("escapes $ in strings, once, and not in comments", () => {
    // In the source: get("$a", "\$b") // $c
    expect(formatKotlin(String.raw`get("$a", "\$b") // $c`)).toBe(
      'get("\\$a", "\\$b") // $c\n',
    );
  });

  it("keeps one blank line at most, and none just inside brackets", () => {
    expect(formatKotlin("a {\n\n\nb\n\n\n\nc\n\n}\n\n")).toBe(
      "a {\n    b\n\n    c\n}\n",
    );
  });

  it("lines up a block comment's stars", () => {
    expect(formatKotlin("  /* a\n   * b\n   */\nx")).toBe(
      "/* a\n * b\n */\nx\n",
    );
  });
});

describe("kotlinSyntaxProblem", () => {
  it("passes finished code, nested comments and raw strings", () => {
    expect(
      kotlinSyntaxProblem(
        'class A {\n  /* (( /* nested */ */\n  val s = """\n  {\n  """\n}',
      ),
    ).toBeNull();
  });

  it("finds a bracket that's never closed, closed by the wrong one, or closing nothing", () => {
    expect(kotlinSyntaxProblem("class A {\n  fun b() {\n}")).toEqual({
      line: 1,
      message: "This { isn't closed.",
    });
    expect(kotlinSyntaxProblem("f(\n  a\n}")).toEqual({
      line: 1,
      message: "This ( isn't closed before the } on line 3.",
    });
    expect(kotlinSyntaxProblem("a)\n")).toEqual({
      line: 1,
      message: "This ) has nothing to close.",
    });
  });

  it("finds a string or comment that's never closed", () => {
    const open = { message: "This string or comment isn't closed." };
    expect(kotlinSyntaxProblem('a\nval s = "half\n')).toMatchObject({
      line: 2,
      ...open,
    });
    expect(kotlinSyntaxProblem("a\n\n/* half")).toMatchObject({
      line: 3,
      ...open,
    });
    expect(kotlinSyntaxProblem('val s = """\nhalf')).toMatchObject({
      line: 1,
      ...open,
    });
  });
});
