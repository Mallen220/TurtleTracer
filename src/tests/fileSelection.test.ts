// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import {
  NO_SELECTION,
  clickSelect,
  pruneSelection,
  rubberSelect,
  selectAllIn,
  selectedFiles,
} from "../lib/components/filemanager/fileSelection";
import type { FileInfo } from "../types";

const f = (name: string, isDirectory = false) =>
  ({ name, path: `/p/${name}`, isDirectory }) as FileInfo;
const dir = f("folder", true);
const [a, b, c, d] = ["a.turt", "b.turt", "c.pp", "d.turt"].map((n) => f(n));
const java = f("X.java");
const order = [dir, a, b, java, c, d];
const paths = (s: { others: string[] }) => s.others;

describe("clickSelect", () => {
  it("a plain click selects only that file", () => {
    const s = clickSelect({ primary: a, others: [b.path] }, c, order, {});
    expect(s).toEqual({ primary: c, others: [] });
  });

  it("shift-click selects the range from the primary, skipping non-project files", () => {
    const s = clickSelect({ primary: a, others: [] }, c, order, {
      shift: true,
    });
    expect(s.primary).toBe(a);
    expect(paths(s)).toEqual([b.path, c.path]); // not X.java
  });

  it("shift-click works upwards and keeps the primary", () => {
    const s = clickSelect({ primary: d, others: [] }, b, order, {
      shift: true,
    });
    expect(s.primary).toBe(d);
    expect(paths(s).sort()).toEqual([b.path, c.path].sort());
  });

  it("ctrl-click toggles a file without changing the primary", () => {
    let s = clickSelect({ primary: a, others: [] }, c, order, { toggle: true });
    expect(s).toEqual({ primary: a, others: [c.path] });
    s = clickSelect(s, c, order, { toggle: true });
    expect(s).toEqual({ primary: a, others: [] });
  });

  it("toggling off the primary promotes the earliest remaining file", () => {
    const s = clickSelect({ primary: a, others: [d.path, b.path] }, a, order, {
      toggle: true,
    });
    expect(s).toEqual({ primary: b, others: [d.path] });
  });

  it("toggling off the only file selects nothing", () => {
    expect(
      clickSelect({ primary: a, others: [] }, a, order, { toggle: true }),
    ).toEqual(NO_SELECTION);
  });

  it("folders and Java files are never added to a multi-selection", () => {
    for (const other of [dir, java]) {
      for (const mods of [{ shift: true }, { toggle: true }]) {
        expect(
          clickSelect({ primary: a, others: [] }, other, order, mods),
        ).toEqual({ primary: other, others: [] });
      }
    }
    // ...and a selected folder doesn't start a multi-selection either.
    expect(
      clickSelect({ primary: dir, others: [] }, a, order, { shift: true }),
    ).toEqual({ primary: a, others: [] });
  });
});

describe("selectAllIn / selectedFiles / pruneSelection", () => {
  it("select all takes every project file and keeps the primary", () => {
    const s = selectAllIn({ primary: c, others: [] }, order);
    expect(s.primary).toBe(c);
    expect(paths(s).sort()).toEqual([a, b, d].map((x) => x.path).sort());
  });

  it("select all with nothing selected makes the first project file primary", () => {
    expect(selectAllIn(NO_SELECTION, order).primary).toBe(a);
  });

  it("lists the primary first, then the rest in display order", () => {
    const list = selectedFiles({ primary: c, others: [d.path, a.path] }, order);
    expect(list.map((x) => x.name)).toEqual(["c.pp", "a.turt", "d.turt"]);
  });

  it("drops files that are no longer listed", () => {
    const s = pruneSelection({ primary: a, others: [b.path, c.path] }, [a, b]);
    expect(s.others).toEqual([b.path]);
  });
});

describe("rubberSelect", () => {
  it("selects what the box touches, the first hit as primary", () => {
    const s = rubberSelect(NO_SELECTION, [dir, b, java, c], false);
    expect(s).toEqual({ primary: b, others: [c.path] });
  });

  it("adds to the selection from before the drag when additive", () => {
    const s = rubberSelect({ primary: a, others: [] }, [c, d], true);
    expect(s.primary).toBe(a);
    expect(s.others.sort()).toEqual([c.path, d.path].sort());
  });

  it("replaces it when not additive, and clears when nothing is hit", () => {
    expect(rubberSelect({ primary: a, others: [] }, [d], false).primary).toBe(
      d,
    );
    expect(rubberSelect({ primary: a, others: [] }, [], false)).toEqual(
      NO_SELECTION,
    );
  });
});
