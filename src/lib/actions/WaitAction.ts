// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import Two from "two.js";
import type {
  ActionDefinition,
  FieldRenderContext,
  CodeExportContext,
  JavaCodeResult,
  TimeCalculationContext,
  TimeCalculationResult,
} from "../actionRegistry";
import WaitTableRow from "../components/table/WaitTableRow.svelte";
import WaitSection from "../components/sections/WaitSection.svelte";
import type { SequenceItem, SequenceWaitItem } from "../../types";
import { POINT_RADIUS } from "../../config";
import { makeId } from "../../utils/nameGenerator";

export const WaitAction: ActionDefinition = {
  kind: "wait",
  label: "Wait",
  buttonColor: "amber",
  isWait: true,
  color: "#f59e0b", // Amber-500
  showInToolbar: true,
  button: {
      label: "Add Wait",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3"><circle cx="12" cy="12" r="9" /><path stroke-linecap="round" stroke-linejoin="round" d="M12 7v5l3 2" /></svg>`
  },
  component: WaitTableRow,
  sectionComponent: WaitSection,

  createDefault: () => ({
    kind: "wait",
    id: makeId(),
    name: "",
    durationMs: 1000,
    locked: false,
  }),

  onInsert: (ctx: InsertionContext) => {
      const newWait: SequenceItem = {
          kind: "wait",
          id: makeId(),
          name: "",
          durationMs: 1000,
          locked: false,
      };

      ctx.sequence.splice(ctx.index, 0, newWait);
      // Wait doesn't modify lines, but we need to trigger reactivity
      // In WaypointTable we called syncLinesToSequence, but wait doesn't affect lines order usually.
      // Just calling the trigger is enough.
      ctx.triggerReactivity();
  },

  renderField: (item: SequenceItem, context: FieldRenderContext) => {
    const waitItem = item as SequenceWaitItem;
    const { timePrediction, x, y, uiLength, hoveredId, selectedPointId } =
      context;

    if (!timePrediction || !timePrediction.timeline) return [];

    const elements: any[] = [];

    // Iterate through timeline to find occurrences of this wait
    timePrediction.timeline.forEach((ev: any) => {
      // Check if this timeline event corresponds to our wait item
      if (ev.type !== "wait" || ev.waitId !== waitItem.id || !ev.atPoint)
        return;

      // Only render if there are event markers on this wait
      if (waitItem.eventMarkers && waitItem.eventMarkers.length > 0) {
        const point = ev.atPoint;

        waitItem.eventMarkers.forEach((marker: any, idx: number) => {
          const isHovered = hoveredId === marker.id;
          const radiusMult = isHovered ? 1.3 : 0.9;

          const markerGroup = new Two.Group();
          // ID structure must match what FieldRenderer/Interaction expects if we want to reuse that logic
          // FieldRenderer uses: `wait-event-${ev.waitId}-${eventIdx}`
          markerGroup.id = `wait-event-${waitItem.id}-${idx}`;

          const markerCircle = new Two.Circle(
            x(point.x),
            y(point.y),
            uiLength(POINT_RADIUS * radiusMult),
          );
          markerCircle.id = `wait-event-circle-${waitItem.id}-${idx}`;

          const waitSelected = selectedPointId === `wait-${waitItem.id}`;

          if (waitSelected) {
            markerCircle.fill = "#f97316";
            markerCircle.stroke = "#fffbeb";
            markerCircle.linewidth = uiLength(0.6);
          } else {
            markerCircle.fill = isHovered ? "#8b5cf6" : "#a78bfa";
            markerCircle.stroke = "#ffffff";
            markerCircle.linewidth = uiLength(0.3);
          }

          const flagSize = uiLength(isHovered ? 1 : 0.6);
          const flagPoints = [
            new Two.Anchor(x(point.x), y(point.y) - flagSize / 2),
            new Two.Anchor(x(point.x) + flagSize / 2, y(point.y)),
            new Two.Anchor(x(point.x), y(point.y) + flagSize / 2),
          ];
          const flag = new Two.Path(flagPoints, true);
          flag.fill = waitSelected ? "#fffbeb" : "#ffffff";
          flag.stroke = "none";
          flag.id = `wait-event-flag-${waitItem.id}-${idx}`;

          markerGroup.add(markerCircle, flag);
          elements.push(markerGroup);
        });
      }
    });

    return elements;
  },

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
          if(pathTimer.getMilliseconds() > ${waitMs}) {
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
    const ParallelRaceClass = isNextFTC
      ? "ParallelRaceGroup"
      : "ParallelRaceGroup";
    const SequentialGroupClass = isNextFTC
      ? "SequentialGroup"
      : "SequentialCommandGroup";

    const getWaitValue = (ms: number) =>
      isNextFTC ? (ms / 1000.0).toFixed(3) : ms.toFixed(0);

    const markers: any[] = Array.isArray(waitItem.eventMarkers)
      ? [...waitItem.eventMarkers]
      : [];

    if (markers.length === 0) {
      return `new ${WaitCmdClass}(${getWaitValue(waitDuration)})`;
    }

    // Sort markers
    markers.sort((a, b) => (a.position || 0) - (b.position || 0));

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
