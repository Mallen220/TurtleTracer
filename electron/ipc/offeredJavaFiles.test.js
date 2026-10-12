// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { findOfferedJavaFile, offerJavaFile } from "./offeredJavaFiles.js";

describe("offered Java files", () => {
  it("finds a file that was offered, however its path is spelled", () => {
    const files = new Set();
    offerJavaFile("/team/src//Auto.java", files);
    expect(findOfferedJavaFile("/team/src/Auto.java", files)).toBe(
      "/team/src/Auto.java",
    );
  });

  it("doesn't find a file that wasn't offered", () => {
    const files = new Set();
    offerJavaFile("/team/Auto.java", files);
    expect(findOfferedJavaFile("/team/Other.java", files)).toBeUndefined();
  });

  it("only offers Java files", () => {
    const files = new Set();
    offerJavaFile("/team/Auto.turt", files);
    offerJavaFile(undefined, files);
    offerJavaFile(42, files);
    expect(files.size).toBe(0);
  });
});
