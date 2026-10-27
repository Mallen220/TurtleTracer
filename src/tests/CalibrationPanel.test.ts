// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/svelte";
import { get } from "svelte/store";
import CalibrationPanel from "../lib/components/telemetry/CalibrationPanel.svelte";
import { calibrationState } from "../lib/motionCalibration";
import { settingsStore } from "../lib/projectStore";
import { notification } from "../stores";
import { DEFAULT_SETTINGS } from "../config/defaults";
import { SCENARIO_MOTION } from "./helpers/motion";
import type { MotionEvent } from "../utils/calibration/events";
import type { Settings } from "../types";

const cruises = (speed: number, n = 3): MotionEvent[] =>
  Array.from({ length: n }, (_, i) => ({
    kind: "cruise" as const,
    t: i,
    speed,
    duration: 0.5,
    direction: "diagonal" as const,
    busy: true,
  }));

function measured(events: MotionEvent[]) {
  calibrationState.set({
    sampleCount: 1234,
    timeSource: "robot",
    hasBusy: true,
    events,
    trace: [
      { t: 0, speed: 0 },
      { t: 0.5, speed: 20 },
      { t: 1, speed: 40 },
    ],
  });
}

const settings = (over: Partial<Settings> = {}) =>
  ({ ...DEFAULT_SETTINGS, ...SCENARIO_MOTION, ...over }) as Settings;

describe("CalibrationPanel", () => {
  beforeEach(() => {
    notification.set(null);
    settingsStore.set(settings());
    calibrationState.set({
      sampleCount: 0,
      timeSource: null,
      hasBusy: false,
      events: [],
      trace: [],
    });
  });

  it("explains itself before any data", () => {
    const { getByText, getByTestId } = render(CalibrationPanel, {
      settings: settings(),
    });
    getByText("Connect, then drive: the robot is measured as it moves.");
    expect(getByTestId("calibration-maxVelocity").textContent).toContain(
      "Need 3 more full-speed drives",
    );
  });

  it("shows progress while measuring", () => {
    measured(cruises(52, 1));
    const { getByText, getByTestId } = render(CalibrationPanel, {
      settings: settings(),
      connected: true,
    });
    getByText("Measuring · 1,234 poses · robot clock");
    const row = getByTestId("calibration-maxVelocity");
    expect(row.textContent).toContain("Need 2 more full-speed drives");
    expect(row.textContent).toContain("1/3");
    expect(
      row.querySelector("[role=progressbar]")!.getAttribute("aria-valuenow"),
    ).toBe("30");
  });

  it("applies a suggestion to the settings as an undoable change", async () => {
    measured(cruises(61));
    const recordChange = vi.fn();
    const { getByRole, getByTestId } = render(CalibrationPanel, {
      settings: settings(),
      recordChange,
    });
    expect(getByTestId("calibration-maxVelocity").textContent).toContain(
      "52% higher than your setting",
    );
    await fireEvent.click(
      getByRole("button", { name: "Set Max Velocity to 61.0 in/s" }),
    );
    expect(get(settingsStore).maxVelocity).toBe(61);
    expect(recordChange).toHaveBeenCalledWith(
      "Set Max Velocity from telemetry",
    );
  });

  it("pops up a new suggestion once, with Apply", async () => {
    measured(cruises(62));
    const recordChange = vi.fn();
    render(CalibrationPanel, { settings: settings(), recordChange });
    await waitFor(() => expect(get(notification)).not.toBeNull());
    const notice = get(notification)!;
    expect(notice.message).toBe(
      "The robot's Max Velocity measures 62.0 in/s; your setting is 40.0 in/s.",
    );
    expect(notice.actionLabel).toBe("Apply");
    notice.action!();
    expect(get(settingsStore).maxVelocity).toBe(62);
    expect(recordChange).toHaveBeenCalledOnce();

    // Not again for the same value.
    notification.set(null);
    measured(cruises(62));
    await Promise.resolve();
    expect(get(notification)).toBeNull();
  });

  it("stays quiet when pop-ups are off", async () => {
    measured(cruises(63));
    const { getByRole } = render(CalibrationPanel, {
      settings: settings({ telemetrySuggestFixes: false }),
    });
    await Promise.resolve();
    expect(get(notification)).toBeNull();
    // The suggestion is still offered in the panel.
    getByRole("button", { name: "Set Max Velocity to 63.0 in/s" });
  });

  it("says when the robot doesn't send its clock", () => {
    measured(cruises(50, 1));
    calibrationState.update((s) => ({ ...s, timeSource: "arrival" }));
    const { getByText } = render(CalibrationPanel, { settings: settings() });
    getByText(/isn't sending its clock/);
  });
});
