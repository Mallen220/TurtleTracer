// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { asVariable, uniqueNames } from "../lib/exporters/javaFormat";

describe("asVariable", () => {
  it("leaves a plain name alone", () => {
    expect(asVariable("Score", false)).toBe("Score");
    expect(asVariable("Score", true)).toBe("Score");
  });

  it("makes a name that starts with a digit a valid variable", () => {
    expect(asVariable("1stShot", false)).toBe("_1stShot");
    expect(asVariable("1stShot", true)).toBe("_1stShot");
  });

  it("makes a Java keyword a valid Java variable", () => {
    for (const name of ["new", "class", "int", "return"]) {
      expect(asVariable(name, false)).toBe(`_${name}`);
    }
  });

  it("puts a Kotlin keyword in backticks instead", () => {
    expect(asVariable("fun", true)).toBe("`fun`");
    expect(asVariable("new", true)).toBe("`new`");
  });
});

describe("uniqueNames", () => {
  it("numbers repeats", () => {
    expect(uniqueNames(["a", "a", "b", "a"])).toEqual(["a", "a_1", "b", "a_2"]);
  });

  it("doesn't reuse a name that was already given as it is", () => {
    const names = uniqueNames(["Path1", "Path1_1", "Path1"]);
    expect(new Set(names).size).toBe(3);
  });
});
