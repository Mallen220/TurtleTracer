// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeAll } from "vitest";
import { render, screen } from "@testing-library/svelte";
import TranslationalPPreview from "../lib/components/settings/tabs/TranslationalPPreview.svelte";
import { previewTranslationalGain } from "../utils/timeCalculator/gainPreview";
import { computePathStatistics } from "../utils/pathStatistics";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { registerCoreUI } from "../lib/coreRegistrations";
import type { Line, Point, SequenceItem, Settings } from "../types";

beforeAll(() => registerCoreUI());

const withP = (translationalP: number, over: Partial<Settings> = {}) =>
  ({ ...DEFAULT_SETTINGS, translationalP, ...over }) as Settings;

describe("the translational P example", () => {
  it("calls a very low value too weak", () => {
    for (const p of [0, 0.01, 0.03]) {
      expect(previewTranslationalGain(withP(p)).verdict).toBe("weak");
    }
  });

  it("calls Pedro's default, and anything higher, fine", () => {
    for (const p of [0.1, 0.4, 1, 2.5, 10]) {
      const preview = previewTranslationalGain(withP(p));
      expect(preview.verdict).toBe("good");
      expect(preview.settled).toBe(true);
    }
  });

  it("never calls a high value wrong: a team may tune it that high on purpose", () => {
    for (const p of [0.7, 1.5, 3, 10, 50]) {
      expect(previewTranslationalGain(withP(p)).verdict).not.toBe("weak");
    }
  });

  it("shows the swing getting smaller as P rises", () => {
    const at = (p: number) => previewTranslationalGain(withP(p));
    expect(at(0.06).overshoot).toBeGreaterThan(at(0.1).overshoot);
    expect(at(0.1).overshoot).toBeGreaterThan(at(0.4).overshoot);
    expect(at(0.4).duration).toBeLessThan(at(0.1).duration);
  });

  it("treats zero as the weakest gain, not as nothing", () => {
    const zero = previewTranslationalGain(withP(0));
    const lowest = previewTranslationalGain(withP(0.01));
    expect(zero.overshoot).toBeCloseTo(lowest.overshoot, 9);
    expect(zero.verdict).toBe("weak");
  });

  it("starts where the robot is handed over and ends on the second path", () => {
    const preview = previewTranslationalGain(withP(0.1));
    expect(preview.trace[0]).toEqual(preview.from);
    expect(preview.from.x).toBeLessThan(preview.joint.x);
    expect(preview.trace.length).toBeGreaterThan(10);
    expect(Math.abs(preview.trace.at(-1)!.x - preview.joint.x)).toBeLessThan(6);
  });

  it("follows the robot's top speed and braking", () => {
    const slow = previewTranslationalGain(withP(0.1, { maxVelocity: 20 }));
    const fast = previewTranslationalGain(withP(0.1, { maxVelocity: 60 }));
    expect(fast.overshoot).toBeGreaterThan(slow.overshoot);
    expect(fast.joint.x - fast.from.x).toBeGreaterThan(
      slow.joint.x - slow.from.x,
    );
  });
});

describe("TranslationalPPreview", () => {
  const text = (id: string) => screen.getByTestId(id).textContent!.trim();

  it("shows the example for the settings it is given", () => {
    render(TranslationalPPreview, { settings: withP(0.1) });
    expect(text("gain-preview-verdict")).toBe("Tracks the path well");
    expect(Number(text("gain-preview-overshoot"))).toBeGreaterThan(0);
    expect(
      screen.getByTestId("gain-preview-route").getAttribute("points"),
    ).toMatch(/\d/);
  });

  it("says when the correction is too weak", () => {
    render(TranslationalPPreview, { settings: withP(0.01) });
    expect(text("gain-preview-verdict")).toBe("Swings wide");
    expect(text("gain-preview-time")).toBe("Never settles");
  });

  it("doesn't tell a team with a high P that it is wrong", () => {
    render(TranslationalPPreview, { settings: withP(2) });
    expect(text("gain-preview-verdict")).toBe("Tracks the path well");
    expect(screen.queryByText(/too strong|too high|oscillat/i)).toBeNull();
  });

  it("is honest about what the example leaves out, in a few words", () => {
    render(TranslationalPPreview, { settings: withP(0.1) });
    const note = screen.getByText(/assumes a robot that responds cleanly/);
    expect(note.textContent!.split(/\s+/).length).toBeLessThan(45);
    expect(note.textContent).toMatch(
      /If yours is stable at your value, it's fine/,
    );
  });

  it("has a text description of the picture", () => {
    render(TranslationalPPreview, { settings: withP(0.1) });
    expect(screen.getByRole("img")).toHaveAttribute(
      "aria-label",
      expect.stringContaining("right-angle turn"),
    );
  });
});

describe("Path Statistics advice about the gain", () => {
  const start = {
    x: 10,
    y: 10,
    heading: "constant",
    degrees: 90,
  } as Point;
  const line = (id: string, x: number, y: number): Line => ({
    id,
    name: id,
    endPoint: { x, y, heading: "constant", degrees: 90 } as Point,
    controlPoints: [],
    color: "#000",
  });
  const lines = [line("out", 70, 10), line("up", 70, 130)];
  const sequence: SequenceItem[] = [
    { kind: "path", lineId: "out" },
    { kind: "path", lineId: "up", isChain: true },
  ];
  const insights = (settings: Settings) =>
    computePathStatistics(start, lines, sequence, settings).insights;

  it("never tells a team their high P is wrong", () => {
    for (const p of [0.5, 1.5, 5]) {
      for (const i of insights(withP(p))) {
        expect(i.message).not.toMatch(/translational P/);
        expect(i.message).not.toMatch(/too high|lower/i);
      }
    }
  });

  it("points out a very low P when the robot can't get back", () => {
    const found = insights(withP(0.01)).find((i) =>
      i.message.includes("still not back on the next path"),
    )!;
    expect(found.type).toBe("error");
    expect(found.message).toContain("translational P (0.01) is very low");
  });

  it("stays quiet about the gain at a sensible value", () => {
    for (const i of insights(withP(0.1))) {
      expect(i.message).not.toContain("translational P");
    }
  });
});
