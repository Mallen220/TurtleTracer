// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import { tick } from "svelte";
import HeadingControlsWrapper from "./HeadingControlsWrapper.svelte";
import type { HeadingFields } from "../lib/components/HeadingControls.svelte";

function setup(
  endPoint: HeadingFields,
  options: { nested?: boolean; locked?: boolean } = {},
) {
  const project = { endPoint };
  const onchange = vi.fn();
  const oncommit = vi.fn();
  let api: { focus: () => void } | undefined;
  render(HeadingControlsWrapper, {
    project,
    onchange,
    oncommit,
    expose: (a) => (api = a),
    ...options,
  });
  return {
    project,
    onchange,
    oncommit,
    focus: () => api!.focus(),
  };
}

const style = () => screen.getByLabelText("Heading style") as HTMLSelectElement;

describe("HeadingControls", () => {
  it("fills in the fields a heading style needs when switching to it", async () => {
    const { project, oncommit } = setup({
      heading: "constant",
      degrees: 45,
    });

    await fireEvent.change(style(), { target: { value: "linear" } });
    expect(project.endPoint).toMatchObject({
      heading: "linear",
      startDeg: 45,
      endDeg: 45,
    });
    expect(oncommit).toHaveBeenCalledTimes(1);

    await fireEvent.change(style(), { target: { value: "facingPoint" } });
    expect(project.endPoint).toMatchObject({ targetX: 72, targetY: 72 });

    await fireEvent.change(style(), { target: { value: "piecewise" } });
    expect(project.endPoint.segments).toEqual([
      { tStart: 0, tEnd: 1, heading: "tangential", reverse: false },
    ]);
  });

  it("takes constant degrees from a linear end angle", async () => {
    const { project } = setup({
      heading: "linear",
      startDeg: 10,
      endDeg: 30,
    });
    await fireEvent.change(style(), { target: { value: "constant" } });
    expect(project.endPoint.degrees).toBe(30);
  });

  it("edits linear angles, reporting changes and commits", async () => {
    const { project, onchange, oncommit } = setup({
      heading: "linear",
      startDeg: 0,
      endDeg: 90,
    });
    const start = screen.getByLabelText("Start Heading");
    await fireEvent.input(start, { target: { value: "15" } });
    expect(project.endPoint.startDeg).toBe(15);
    expect(onchange).toHaveBeenCalled();
    expect(oncommit).not.toHaveBeenCalled();
    await fireEvent.blur(start);
    expect(oncommit).toHaveBeenCalledTimes(1);

    await fireEvent.input(screen.getByLabelText("End Heading"), {
      target: { value: "-45" },
    });
    expect(project.endPoint.endDeg).toBe(-45);
  });

  it("offers to wrap out-of-range angles into [-180, 180]", async () => {
    const { project } = setup({
      heading: "linear",
      startDeg: 270,
      endDeg: 90,
    });
    const fixes = screen.getAllByLabelText(/Angle is out of bounds/);
    expect(fixes).toHaveLength(1);
    await fireEvent.click(fixes[0]);
    expect(project.endPoint.startDeg).toBe(-90);
    expect(screen.queryByLabelText(/Angle is out of bounds/)).toBeNull();
  });

  it("wraps constant angles and resets a cleared one to 0", async () => {
    const { project } = setup({ heading: "constant", degrees: -200 });
    await fireEvent.click(screen.getByLabelText(/Angle is out of bounds/));
    expect(project.endPoint.degrees).toBe(160);

    const input = screen.getByLabelText("Constant Heading") as HTMLInputElement;
    input.value = "";
    await fireEvent.blur(input);
    expect(project.endPoint.degrees).toBe(0);
    expect(input.value).toBe("0");
  });

  it("treats a cleared angle as 0, like the constant box", async () => {
    const { project } = setup({ heading: "linear", startDeg: 30, endDeg: 0 });
    const start = screen.getByLabelText("Start Heading") as HTMLInputElement;
    start.value = "";
    await fireEvent.blur(start);
    expect(project.endPoint.startDeg).toBe(0);
    expect(start.value).toBe("0");
  });

  it("edits the point to face", async () => {
    const { project } = setup({
      heading: "facingPoint",
      targetX: 1,
      targetY: 2,
    });
    await fireEvent.input(screen.getByLabelText("Target X"), {
      target: { value: "12.5" },
    });
    await fireEvent.input(screen.getByLabelText("Target Y"), {
      target: { value: "40" },
    });
    expect(project.endPoint).toMatchObject({ targetX: 12.5, targetY: 40 });
  });

  it("toggles reverse", async () => {
    const { project } = setup({ heading: "tangential", reverse: false });
    expect(screen.getByText("Facing Forward")).toBeTruthy();
    await fireEvent.click(screen.getByLabelText("Reverse heading direction"));
    expect(project.endPoint.reverse).toBe(true);
    expect(screen.getByText("Facing Backward")).toBeTruthy();
  });

  it("focuses the main input for the current style", async () => {
    const constant = setup({ heading: "constant", degrees: 0 });
    constant.focus();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Constant Heading"),
    );
    document.body.innerHTML = "";

    const linear = setup({ heading: "linear", startDeg: 0, endDeg: 0 });
    linear.focus();
    expect(document.activeElement).toBe(screen.getByLabelText("Start Heading"));
    document.body.innerHTML = "";

    const tangential = setup({ heading: "tangential" });
    tangential.focus();
    expect(document.activeElement).toBe(
      screen.getByLabelText("Reverse heading direction"),
    );
    document.body.innerHTML = "";

    const facing = setup({ heading: "facingPoint", targetX: 0, targetY: 0 });
    facing.focus();
    expect(document.activeElement).toBe(screen.getByLabelText("Target X"));
  });

  it("hides piecewise inside a piecewise segment", () => {
    setup({ heading: "constant", degrees: 0 }, { nested: true });
    const options = [...style().options].map((o) => o.value);
    expect(options).not.toContain("piecewise");
  });

  it("disables everything when locked", () => {
    setup({ heading: "linear", startDeg: 0, endDeg: 0 }, { locked: true });
    expect(style().disabled).toBe(true);
    expect(
      (screen.getByLabelText("Start Heading") as HTMLInputElement).disabled,
    ).toBe(true);
  });

  describe("piecewise segments", () => {
    const piecewise = (): HeadingFields => ({
      heading: "piecewise",
      segments: [
        { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 10 },
        { tStart: 0.5, tEnd: 1, heading: "tangential", reverse: false },
      ],
    });

    it("adds a transition by splitting the last segment", async () => {
      const { project } = setup(piecewise());
      await fireEvent.click(screen.getByText("Add Transition"));
      expect(project.endPoint.segments).toEqual([
        { tStart: 0, tEnd: 0.5, heading: "constant", degrees: 10 },
        { tStart: 0.5, tEnd: 0.75, heading: "tangential", reverse: false },
        { tStart: 0.75, tEnd: 1, heading: "tangential", reverse: false },
      ]);
    });

    it("moves a transition, keeping both sides joined", async () => {
      const { project } = setup(piecewise());
      const [transition] = screen.getAllByDisplayValue("0.5");
      await fireEvent.input(transition, { target: { value: "0.3" } });
      expect(project.endPoint.segments).toMatchObject([
        { tStart: 0, tEnd: 0.3 },
        { tStart: 0.3, tEnd: 1 },
      ]);
    });

    it("removes a transition, merging into the segment before", async () => {
      const { project } = setup(piecewise());
      await fireEvent.click(screen.getByTitle("Remove Transition"));
      expect(project.endPoint.segments).toEqual([
        { tStart: 0, tEnd: 1, heading: "constant", degrees: 10 },
      ]);
    });

    it("reorders headings without moving the transition points", async () => {
      const { project } = setup(piecewise());
      await fireEvent.click(screen.getAllByLabelText("Move down")[0]);
      expect(project.endPoint.segments).toEqual([
        { tStart: 0, tEnd: 0.5, heading: "tangential", reverse: false },
        { tStart: 0.5, tEnd: 1, heading: "constant", degrees: 10 },
      ]);
    });

    it("edits a segment's own heading", async () => {
      const { project } = setup(piecewise());
      await fireEvent.input(screen.getByLabelText("Constant Heading"), {
        target: { value: "25" },
      });
      await tick();
      expect(project.endPoint.segments![0].degrees).toBe(25);
    });
  });
});
