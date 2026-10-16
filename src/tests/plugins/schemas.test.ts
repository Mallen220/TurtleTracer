// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect } from "vitest";
import fc from "fast-check";
import {
  check,
  editOpsSchema,
  formFieldsSchema,
  jsonSchema,
  messageSchema,
  poseTrackSchema,
  primitivesSchema,
  MAX_PRIMITIVES,
} from "../../lib/plugins/host/schemas";

describe("plugin message checks", () => {
  it("accepts the protocol's messages", () => {
    for (const message of [
      { type: "call", id: 1, method: "ui.toast", args: ["hi"] },
      { type: "notify", method: "ready", args: [] },
      { type: "result", id: 1, ok: true, value: 3 },
      { type: "result", id: 1, ok: false, error: "nope" },
    ]) {
      expect(() => check(messageSchema, message, "message")).not.toThrow();
    }
  });

  it("refuses anything else, with a reason", () => {
    expect(() =>
      check(messageSchema, { type: "eval", code: "x" }, "message"),
    ).toThrow(/Invalid message/);
    expect(() =>
      check(
        messageSchema,
        { type: "call", id: 1, method: "x", args: new Array(20) },
        "message",
      ),
    ).toThrow();
  });
});

describe("drawings", () => {
  it("accepts every kind of shape", () => {
    const shapes = [
      { type: "circle", x: 1, y: 2, radius: 3, fill: "red" },
      {
        type: "rect",
        x: 1,
        y: 2,
        width: 3,
        height: 4,
        rotation: 45,
        space: "robot",
      },
      {
        type: "line",
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
        dash: [1, 2],
      },
      { type: "text", x: 0, y: 0, text: "hi", align: "left", bold: true },
      { type: "arrow", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
      { type: "robot", track: "sim", opacity: 0.5 },
    ];
    expect(check(primitivesSchema, shapes, "drawing")).toHaveLength(6);
  });

  it("refuses numbers that aren't finite and drawings that are too big", () => {
    expect(() =>
      check(
        primitivesSchema,
        [{ type: "circle", x: Infinity, y: 0, radius: 1 }],
        "drawing",
      ),
    ).toThrow(/x/);
    const tooMany = Array.from({ length: MAX_PRIMITIVES + 1 }, () => ({
      type: "circle",
      x: 0,
      y: 0,
      radius: 1,
    }));
    expect(() => check(primitivesSchema, tooMany, "drawing")).toThrow();
  });

  it("only ever passes finite numbers, whatever it's given", () => {
    const allFinite = (value: unknown): boolean =>
      typeof value === "number"
        ? Number.isFinite(value)
        : value === null || typeof value !== "object"
          ? true
          : Object.values(value).every(allFinite);
    const shape = fc.record({
      type: fc.constantFrom("circle", "rect", "line", "text", "arrow", "robot"),
      x: fc.oneof(fc.double(), fc.integer()),
      y: fc.oneof(fc.double(), fc.integer()),
      radius: fc.double(),
      width: fc.double(),
      height: fc.double(),
      text: fc.string(),
      points: fc.array(fc.record({ x: fc.double(), y: fc.double() })),
    });
    fc.assert(
      fc.property(fc.oneof(fc.anything(), shape), (value) => {
        const result = primitivesSchema.safeParse([value]);
        return !result.success || allFinite(result.data);
      }),
      { numRuns: 500 },
    );
  });
});

describe("pose tracks", () => {
  const track = poseTrackSchema(10);

  it("needs arrays of the same length with times in order", () => {
    expect(() =>
      check(
        track,
        { t: [0, 1], x: [0, 1], y: [0, 1], heading: [0, 1] },
        "track",
      ),
    ).not.toThrow();
    expect(() =>
      check(track, { t: [0, 1], x: [0], y: [0, 1], heading: [0, 1] }, "track"),
    ).toThrow(/same length/);
    expect(() =>
      check(
        track,
        { t: [1, 0], x: [0, 1], y: [0, 1], heading: [0, 1] },
        "track",
      ),
    ).toThrow(/backwards/);
  });

  it("caps how many samples there can be", () => {
    const long = Array.from({ length: 11 }, (_, i) => i);
    expect(() =>
      check(track, { t: long, x: long, y: long, heading: long }, "track"),
    ).toThrow();
  });
});

describe("forms", () => {
  it("refuses two fields with one key", () => {
    expect(() =>
      check(
        formFieldsSchema,
        [
          { key: "a", type: "text", label: "A" },
          { key: "a", type: "toggle", label: "B" },
        ],
        "form",
      ),
    ).toThrow(/same key/);
  });

  it("needs options for a select", () => {
    expect(() =>
      check(
        formFieldsSchema,
        [{ key: "a", type: "select", label: "A", options: [] }],
        "form",
      ),
    ).toThrow();
  });
});

describe("JSON values and edits", () => {
  it("drops functions and refuses NaN", () => {
    expect(
      jsonSchema.safeParse({ a: [1, "b", null, { c: true }] }).success,
    ).toBe(true);
    expect(jsonSchema.safeParse({ a: Number.NaN }).success).toBe(false);
    expect(jsonSchema.safeParse({ a: () => 1 }).success).toBe(false);
  });

  it("only knows the documented edit operations", () => {
    expect(
      editOpsSchema.safeParse([{ op: "moveStart", x: 1, y: 2 }]).success,
    ).toBe(true);
    expect(editOpsSchema.safeParse([{ op: "deleteEverything" }]).success).toBe(
      false,
    );
    expect(
      editOpsSchema.safeParse([{ op: "addShape", vertices: [{ x: 0, y: 0 }] }])
        .success,
    ).toBe(false);
  });
});
