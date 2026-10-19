// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { pathReferenceProblems } from "./pathReferences";
import type { Line, SequenceItem } from "../types";

const line = (id: string | undefined) => ({ id }) as Line;
const path = (lineId: string) => ({ kind: "path", lineId }) as SequenceItem;
const wait = () => ({ kind: "wait", id: "w", durationMs: 0 }) as SequenceItem;

describe("pathReferenceProblems", () => {
  it("finds nothing wrong when every path is in the sequence once", () => {
    expect(
      pathReferenceProblems(
        [line("a"), line("b")],
        [path("a"), wait(), path("b")],
      ),
    ).toEqual({ missing: [], invalid: [] });
  });

  it("lists paths the sequence leaves out", () => {
    expect(pathReferenceProblems([line("a"), line("b")], [path("a")])).toEqual({
      missing: ["b"],
      invalid: [],
    });
  });

  it("lists path steps whose path doesn't exist", () => {
    expect(
      pathReferenceProblems([line("a")], [path("a"), path("gone")]),
    ).toEqual({ missing: [], invalid: ["gone"] });
  });

  it("ignores paths without an id", () => {
    expect(pathReferenceProblems([line(undefined)], [])).toEqual({
      missing: [],
      invalid: [],
    });
  });

  it("copes with a missing list", () => {
    expect(
      pathReferenceProblems(undefined as unknown as Line[], undefined as never),
    ).toEqual({ missing: [], invalid: [] });
  });
});
