// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
import Two from "two.js";
import type {
  ActionDefinition,
  FieldRenderContext,
  CodeExportContext,
  JavaCodeResult,
  TimeCalculationContext,
  TimeCalculationResult,
  InsertionContext,
} from "../actionRegistry";
import WaitTableRow from "../components/table/WaitTableRow.svelte";
import WaitSection from "../components/sections/WaitSection.svelte";
import type { SequenceItem, SequenceWaitItem } from "../../types";
import { stationaryMarkerElements } from "./stationaryMarkers";
import { makeId } from "../../utils/nameGenerator";

/** A new one-second wait. */
export const createWait = (): SequenceWaitItem => ({
  kind: "wait",
  id: makeId(),
  name: "",
  durationMs: 1000,
  locked: false,
});

export const WaitAction: ActionDefinition = {
  kind: "wait",
  label: "Wait",
  buttonColor: "amber",
  isWait: true,
  color: "#f59e0b", // Amber-500
  showInToolbar: true,
  button: {
    label: "Add Wait",
  },
  component: WaitTableRow,
  sectionComponent: WaitSection,

  createDefault: createWait,

  onInsert: (ctx: InsertionContext) => {
    ctx.sequence.splice(ctx.index, 0, createWait());
    ctx.triggerReactivity();
  },

  renderField: (item: SequenceItem, context: FieldRenderContext) =>
    stationaryMarkerElements(item as SequenceWaitItem, context, {
      prefix: "wait",
      fill: "#a78bfa",
      hoverFill: "#8b5cf6",
      glyphName: "flag",
      // A small right-pointing triangle
      glyph: (px, py, size, color) => {
        const flag = new Two.Path(
          [
            new Two.Anchor(px, py - size / 2),
            new Two.Anchor(px + size / 2, py),
            new Two.Anchor(px, py + size / 2),
          ],
          true,
        );
        flag.fill = color;
        flag.stroke = "none";
        return flag;
      },
    }),

  toJavaCode: (
    item: SequenceItem,
    context: CodeExportContext,
  ): JavaCodeResult => {
    const waitItem = item as SequenceWaitItem;
    const waitMs = waitItem.durationMs || 0;
    const stateStep = context.stateStep || 0;

    let code = `
        case ${stateStep}:
          setPathState(${stateStep + 1});
          break;

        case ${stateStep + 1}:
          if(pathTimer.milliseconds() > ${waitMs}) {
            setPathState(${stateStep + 2});
          }
          break;`;

    return { code, stepsUsed: 2 };
  },

  toSequentialCommand: (
    item: SequenceItem,
    context: CodeExportContext,
  ): string => {
    const waitItem = item as SequenceWaitItem;
    const waitDuration = waitItem.durationMs || 0;
    const isNextFTC = context.isNextFTC || false;

    // Define classes based on library
    const WaitCmdClass = isNextFTC ? "Delay" : "WaitCommand";
    const InstantCmdClass = "InstantCommand";
    const ParallelRaceClass = "ParallelRaceGroup"; // Same for NextFTC and SolversLib
    const SequentialGroupClass = isNextFTC
      ? "SequentialGroup"
      : "SequentialCommandGroup";

    const getWaitValue = (ms: number) =>
      isNextFTC ? (ms / 1000).toFixed(3) : ms.toFixed(0);

    const markers = (waitItem.eventMarkers ?? []).toSorted(
      (a, b) => (a.position || 0) - (b.position || 0),
    );

    if (markers.length === 0) {
      return `new ${WaitCmdClass}(${getWaitValue(waitDuration)})`;
    }

    let scheduled = 0;
    const markerCommandParts: string[] = [];

    markers.forEach((marker) => {
      const targetMs =
        Math.max(0, Math.min(1, marker.position || 0)) * waitDuration;
      const delta = Math.max(0, targetMs - scheduled);
      scheduled = targetMs;

      markerCommandParts.push(
        `new ${WaitCmdClass}(${getWaitValue(delta)}), new ${InstantCmdClass}(() -> progressTracker.executeEvent("${marker.name}"))`,
      );
    });

    const remaining = Math.max(0, waitDuration - scheduled);
    markerCommandParts.push(`new ${WaitCmdClass}(${getWaitValue(remaining)})`);

    return `new ${ParallelRaceClass}(
                    new ${WaitCmdClass}(${getWaitValue(waitDuration)}),
                    new ${SequentialGroupClass}(${markerCommandParts.join(",")})
                )`;
  },

  calculateTime: (
    item: SequenceItem,
    context: TimeCalculationContext,
  ): TimeCalculationResult => {
    const waitItem = item as SequenceWaitItem;
    const waitSeconds = (waitItem.durationMs || 0) / 1000;
    const { currentTime, currentHeading, lastPoint } = context;

    if (waitSeconds <= 0) {
      return { events: [], duration: 0 };
    }

    const event = {
      type: "wait" as const,
      name: waitItem.name,
      duration: waitSeconds,
      startTime: currentTime,
      endTime: currentTime + waitSeconds,
      waitId: waitItem.id,
      startHeading: currentHeading,
      targetHeading: currentHeading,
      atPoint: lastPoint,
    };

    return {
      events: [event],
      duration: waitSeconds,
    };
  },
};
