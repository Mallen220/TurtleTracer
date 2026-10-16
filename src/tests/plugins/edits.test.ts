// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import { applyEdits, type EditableProject } from "../../lib/plugins/host/edits";
import type { Line } from "../../types";

const line = (
  id: string,
  x: number,
  y: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  name: "",
  endPoint: { x, y, heading: "tangential", reverse: false },
  controlPoints: [{ x: 1, y: 1 }],
  color: "#000000",
  ...extra,
});

const project = (): EditableProject => ({
  startPoint: { x: 0, y: 0, heading: "tangential", reverse: false },
  lines: [line("a", 10, 10), line("b", 20, 20)],
  shapes: [
    {
      id: "s1",
      name: "Box",
      vertices: [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
      ],
      color: "#f00",
      fillColor: "#f00",
    },
  ],
  sequence: [
    { kind: "path", lineId: "a" },
    { kind: "wait", id: "w1", name: "", durationMs: 100 },
    {
      kind: "plugin",
      id: "mine",
      type: "me.intake",
      name: "",
      data: { power: 1 },
    },
    { kind: "plugin", id: "theirs", type: "other.thing", name: "", data: {} },
    { kind: "path", lineId: "b" },
  ],
});

const ctx = (canWrite: boolean) => ({
  pluginId: "me",
  canWrite,
  actionDefaults: (type: string) =>
    type === "me.intake" || type === "other.thing" ? { power: 0.5 } : null,
});

describe("plugin edits", () => {
  it("lets a plugin add and change its own steps without project.write", () => {
    const edited = applyEdits(
      project(),
      [
        {
          op: "insertStep",
          index: 0,
          step: { kind: "plugin", type: "intake", name: "Go" },
        },
        {
          op: "updateStep",
          id: "mine",
          changes: { data: { power: 0.2 }, name: "Slow" },
        },
      ],
      ctx(false),
    );
    expect(edited.sequence[0]).toMatchObject({
      kind: "plugin",
      type: "me.intake",
      name: "Go",
      data: { power: 0.5 },
    });
    expect(
      edited.sequence.find((s) => s.kind === "plugin" && s.id === "mine"),
    ).toMatchObject({
      name: "Slow",
      data: { power: 0.2 },
    });
  });

  it("needs project.write for anything else", () => {
    const attempts = [
      { op: "removeStep", id: "theirs" },
      { op: "updateStep", id: "w1", changes: { durationMs: 5 } },
      { op: "insertStep", index: 0, step: { kind: "wait", durationMs: 1 } },
      {
        op: "insertStep",
        index: 0,
        step: { kind: "plugin", type: "other.thing" },
      },
      { op: "movePoint", pathId: "a", point: "end", x: 1, y: 1 },
      { op: "moveStart", x: 1, y: 1 },
      {
        op: "addShape",
        vertices: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
        ],
      },
      { op: "removeShape", id: "s1" },
    ] as const;
    for (const op of attempts) {
      expect(() => applyEdits(project(), [op as any], ctx(false))).toThrow(
        /project\.write/,
      );
    }
  });

  it("applies core edits with the permission", () => {
    const edited = applyEdits(
      project(),
      [
        { op: "movePoint", pathId: "a", point: "end", x: 50, y: 60 },
        { op: "movePoint", pathId: "a", point: 0, x: 5, y: 6 },
        { op: "moveStart", x: 3, y: 4 },
        { op: "updateStep", id: "w1", changes: { durationMs: 900 } },
        {
          op: "addShape",
          vertices: [
            { x: 0, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: 1 },
          ],
          name: "Zone",
        },
        { op: "updateShape", id: "s1", changes: { name: "Renamed" } },
      ],
      ctx(true),
    );
    expect(edited.lines[0].endPoint).toMatchObject({ x: 50, y: 60 });
    expect(edited.lines[0].controlPoints[0]).toEqual({ x: 5, y: 6 });
    expect(edited.startPoint).toMatchObject({ x: 3, y: 4 });
    expect(edited.sequence[1]).toMatchObject({ durationMs: 900 });
    expect(edited.shapes.map((s) => s.name)).toEqual(["Renamed", "Zone"]);
  });

  it("adds and removes paths, keeping the sequence in step", () => {
    const added = applyEdits(
      project(),
      [
        {
          op: "addPath",
          to: { x: 70, y: 80 },
          controlPoints: [{ x: 60, y: 60 }],
          name: "New",
        },
      ],
      ctx(true),
    );
    const newLine = added.lines.find((l) => l.name === "New")!;
    expect(newLine.endPoint).toMatchObject({ x: 70, y: 80 });
    expect(newLine.controlPoints).toEqual([{ x: 60, y: 60 }]);
    expect(added.sequence.at(-1)).toEqual({ kind: "path", lineId: newLine.id });

    const removed = applyEdits(
      project(),
      [{ op: "removeStep", id: "a" }],
      ctx(true),
    );
    expect(removed.lines.map((l) => l.id)).toEqual(["b"]);
    expect(
      removed.sequence.some((s) => s.kind === "path" && s.lineId === "a"),
    ).toBe(false);
  });

  it("refuses locked paths, the last path and unknown things", () => {
    const locked = project();
    locked.lines[0].locked = true;
    expect(() =>
      applyEdits(
        locked,
        [{ op: "movePoint", pathId: "a", point: "end", x: 0, y: 0 }],
        ctx(true),
      ),
    ).toThrow(/locked/);

    const one = project();
    one.lines = [one.lines[0]];
    expect(() =>
      applyEdits(one, [{ op: "removePath", id: "a" }], ctx(true)),
    ).toThrow(/at least one path/);
    expect(() =>
      applyEdits(project(), [{ op: "removeStep", id: "zzz" }], ctx(true)),
    ).toThrow(/no step/);
    expect(() =>
      applyEdits(
        project(),
        [
          {
            op: "insertStep",
            index: 0,
            step: { kind: "plugin", type: "nope" },
          },
        ],
        ctx(true),
      ),
    ).toThrow(/no action type/);
  });

  it("fills in what an operation leaves out", () => {
    const start = project();
    start.sequence.push({ kind: "rotate", id: "r1", name: "", degrees: 0 });
    const edited = applyEdits(
      start,
      [
        { op: "insertStep", index: 99, step: { kind: "wait", durationMs: 5 } },
        {
          op: "insertStep",
          index: 99,
          step: { kind: "rotate", degrees: 30, name: "Turn" },
        },
        { op: "updateStep", id: "r1", changes: { degrees: 90 } },
        { op: "removeStep", id: "theirs" },
        { op: "addPath", to: { x: 1, y: 2 }, color: "#123456" },
        {
          op: "addShape",
          vertices: [
            { x: 0, y: 0 },
            { x: 2, y: 0 },
            { x: 0, y: 2 },
          ],
          kind: "keep-in",
        },
        {
          op: "updateShape",
          id: "s1",
          changes: { vertices: [{ x: 5, y: 5 }], color: "#00ff00" },
        },
      ],
      ctx(true),
    );
    expect(
      edited.sequence.find((s) => s.kind === "rotate" && s.id === "r1"),
    ).toMatchObject({ degrees: 90 });
    expect(
      edited.sequence.some((s) => s.kind !== "path" && s.id === "theirs"),
    ).toBe(false);
    expect(
      edited.sequence.filter((s) => s.kind === "wait" || s.kind === "rotate"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: "wait", name: "", durationMs: 5 }),
        expect.objectContaining({ kind: "rotate", name: "Turn", degrees: 30 }),
      ]),
    );
    const newLine = edited.lines.find((l) => l.color === "#123456")!;
    expect(newLine.controlPoints).toEqual([]);
    expect(edited.shapes[0]).toMatchObject({
      vertices: [{ x: 5, y: 5 }],
      color: "#00ff00",
    });
    expect(edited.shapes[1]).toMatchObject({
      name: "",
      type: "keep-in",
      color: "#dc2626",
    });
  });

  it("refuses unknown paths, missing control points and locked shapes", () => {
    expect(() =>
      applyEdits(
        project(),
        [{ op: "movePoint", pathId: "zzz", point: "end", x: 0, y: 0 }],
        ctx(true),
      ),
    ).toThrow(/no path/);
    expect(() =>
      applyEdits(
        project(),
        [{ op: "movePoint", pathId: "a", point: 3, x: 0, y: 0 }],
        ctx(true),
      ),
    ).toThrow(/no control point 3/);
    const locked = project();
    locked.shapes[0] = { ...locked.shapes[0], name: "", locked: true };
    expect(() =>
      applyEdits(
        locked,
        [{ op: "updateShape", id: "s1", changes: { name: "x" } }],
        ctx(true),
      ),
    ).toThrow(/"s1" is locked/);
  });

  it("leaves the project untouched when any operation fails", () => {
    const original = project();
    const snapshot = structuredClone(original);
    expect(() =>
      applyEdits(
        original,
        [
          { op: "moveStart", x: 99, y: 99 },
          { op: "removeShape", id: "missing" },
        ],
        ctx(true),
      ),
    ).toThrow();
    expect(original).toEqual(snapshot);
  });
});
