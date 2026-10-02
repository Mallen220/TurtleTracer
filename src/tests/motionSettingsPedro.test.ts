// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { render, screen, fireEvent } from "@testing-library/svelte";
import { describe, it, expect } from "vitest";
import MotionSettingsTabWrapper from "./MotionSettingsTabWrapper.svelte";
import type { Settings } from "../types";

// Labels in the stacked layout include the setting's description.
const field = (name: string) =>
  screen.getByLabelText(
    new RegExp("^" + name.replace(/[()]/g, String.raw`\$&`)),
  );

const mount = (props: Record<string, unknown> = {}) => {
  const view = render(MotionSettingsTabWrapper, props as any);
  return {
    ...view,
    current: () => (view.component as any).getSettings() as Settings,
  };
};

describe("Pedro Pathing behavior settings", () => {
  it("shows each setting at its current value", () => {
    mount({
      initial: {
        pedroVersion: "v2",
        pathSettleTime: 0.2,
        stopToTurn: false,
        brakingQuadratic: 0.03,
        brakingLinear: 0.4,
      },
    });
    expect((field("Pedro Pathing Version") as HTMLSelectElement).value).toBe(
      "v2",
    );
    expect((field("Path Settle Time (s)") as HTMLInputElement).value).toBe(
      "0.2",
    );
    expect((field("Stop to Turn") as HTMLInputElement).checked).toBe(false);
    expect(
      (field("Braking Distance, Quadratic") as HTMLInputElement).value,
    ).toBe("0.03");
    expect((field("Braking Distance, Linear") as HTMLInputElement).value).toBe(
      "0.4",
    );
  });

  it("starts at Pedro v3, turning while it drives like Pedro does", () => {
    mount();
    expect((field("Pedro Pathing Version") as HTMLSelectElement).value).toBe(
      "v3",
    );
    expect((field("Stop to Turn") as HTMLInputElement).checked).toBe(false);
  });

  it("saves changes", async () => {
    const t = mount();
    await fireEvent.change(field("Pedro Pathing Version"), {
      target: { value: "v2" },
    });
    expect(t.current().pedroVersion).toBe("v2");

    await fireEvent.click(field("Stop to Turn"));
    expect(t.current().stopToTurn).toBe(true);

    await fireEvent.input(field("Path Settle Time (s)"), {
      target: { value: "0.15" },
    });
    expect(t.current().pathSettleTime).toBeCloseTo(0.15);

    await fireEvent.input(field("Braking Distance, Quadratic"), {
      target: { value: "0.02" },
    });
    expect(t.current().brakingQuadratic).toBeCloseTo(0.02);
  });

  it("doesn't let a negative value through when the field is left", async () => {
    const t = mount();
    await fireEvent.change(field("Path Settle Time (s)"), {
      target: { value: "-1" },
    });
    expect(t.current().pathSettleTime).toBe(0);
  });

  it("can be found by searching settings", () => {
    mount({ searchQuery: "settle" });
    const row = field("Path Settle Time (s)").closest(".transition-all")!;
    expect(row.classList.contains("hidden")).toBe(false);
    const other = field("Stop to Turn").closest(".transition-all")!;
    expect(other.classList.contains("hidden")).toBe(true);
  });

  it("offers the translational P, at Pedro's default, and saves changes to it", async () => {
    const t = mount();
    expect((field("Translational P") as HTMLInputElement).value).toBe("0.1");
    await fireEvent.input(field("Translational P"), {
      target: { value: "0.25" },
    });
    expect(t.current().translationalP).toBeCloseTo(0.25);
    // Zero (or less) isn't possible: it becomes the smallest value allowed.
    await fireEvent.change(field("Translational P"), {
      target: { value: "-1" },
    });
    expect(t.current().translationalP).toBe(0.01);
    await fireEvent.change(field("Translational P"), {
      target: { value: "0" },
    });
    expect(t.current().translationalP).toBe(0.01);
    expect(field("Translational P")).toHaveAttribute("min", "0.01");
  });

  it("shows what the translational P does, and updates as it changes", async () => {
    mount();
    expect(screen.getByTestId("gain-preview")).toBeInTheDocument();
    expect(screen.getByTestId("gain-preview-verdict").textContent).toBe(
      "Tracks the path well",
    );
    // A high value isn't called wrong.
    await fireEvent.input(field("Translational P"), {
      target: { value: "1.5" },
    });
    expect(screen.getByTestId("gain-preview-verdict").textContent).toBe(
      "Tracks the path well",
    );
    await fireEvent.input(field("Translational P"), {
      target: { value: "0.01" },
    });
    expect(screen.getByTestId("gain-preview-verdict").textContent).toBe(
      "Swings wide",
    );
  });

  it("hides the example when searching for something else", () => {
    mount({ searchQuery: "friction" });
    expect(screen.queryByTestId("gain-preview")).toBeNull();
  });

  it("keeps the example when searching for the translational P", () => {
    mount({ searchQuery: "translational" });
    expect(screen.getByTestId("gain-preview")).toBeInTheDocument();
  });

  it("no longer offers the removed settings", () => {
    mount();
    expect(screen.queryByLabelText(/Slow Down for Curves/)).toBeNull();
    expect(screen.queryByLabelText(/Heading Response Time/)).toBeNull();
  });

  it("labels the two velocities as forward and strafe", () => {
    mount();
    expect(field("Forward Velocity (in/s)")).toHaveAttribute(
      "id",
      "x-velocity",
    );
    expect(field("Strafe Velocity (in/s)")).toHaveAttribute("id", "y-velocity");
    expect(screen.queryByLabelText(/^X Velocity/)).toBeNull();
  });

  it("keeps the braking coefficients in an advanced section, closed until searched", () => {
    const { container } = mount();
    const details = container.querySelector("details")!;
    expect(details.textContent).toContain("Advanced braking");
    expect(details.querySelector("#braking-quadratic")).not.toBeNull();
    expect(details.querySelector("#braking-linear")).not.toBeNull();
    expect(details.open).toBe(false);
  });

  it("opens the advanced section when searching", () => {
    const { container } = mount({ searchQuery: "braking" });
    expect(container.querySelector("details")!.open).toBe(true);
  });

  it("describes friction as only for the wheel slip warning", () => {
    mount();
    expect(field("Friction Coefficient")).toBeInTheDocument();
    expect(
      screen.getByText(/Used for the wheel slip warning in Path Statistics/),
    ).toBeInTheDocument();
  });

  it("says where to get the numbers, and tells each setting which Pedro value to copy", () => {
    mount();
    const note = screen.getByTestId("where-to-find-numbers");
    expect(note.textContent).toContain("Foresight");
    expect(note.querySelector("a")).toHaveAttribute(
      "href",
      "https://pedropathing.com/docs/pathing/tuning/foresight",
    );
    expect(
      screen.getByText(/maxAchievableForwardVelocity/),
    ).toBeInTheDocument();
    expect(screen.getByText(/maxAchievableStrafeVelocity/)).toBeInTheDocument();
    expect(screen.getByText(/quadraticBrakeCoefficients/)).toBeInTheDocument();
  });

  it("leaves the note out while searching", () => {
    mount({ searchQuery: "velocity" });
    expect(screen.queryByTestId("where-to-find-numbers")).toBeNull();
  });
});
