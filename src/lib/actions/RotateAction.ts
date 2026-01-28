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
import RotateTableRow from "../components/table/RotateTableRow.svelte";
import RotateSection from "../components/sections/RotateSection.svelte";
import type { SequenceItem, SequenceRotateItem } from "../../types";
import { POINT_RADIUS } from "../../config";
import { calculateRotationTime, unwrapAngle } from "../../utils/timeCalculator";
import { makeId } from "../../utils/nameGenerator";

export const RotateAction: ActionDefinition = {
  kind: "rotate",
  label: "Rotate",
  buttonColor: "pink",
  isRotate: true,
  color: "#ec4899", // Pink-500
  showInToolbar: true,
  button: {
      label: "Add Rotate",
      icon: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-3"><path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>`
  },
  component: RotateTableRow,
  sectionComponent: RotateSection,

  createDefault: () => ({
    kind: "rotate",
    id: makeId(),
    name: "",
    degrees: 0,
    locked: false,
  }),

  onInsert: (ctx: InsertionContext) => {
      const newRotate: SequenceItem = {
          kind: "rotate",
          id: makeId(),
          name: "",
          degrees: 0,
          locked: false,
      };

      ctx.sequence.splice(ctx.index, 0, newRotate);
      ctx.triggerReactivity();
  },

  renderField: (item: SequenceItem, context: FieldRenderContext) => {
    const rotateItem = item as SequenceRotateItem;
    const { timePrediction, x, y, uiLength, hoveredId, selectedPointId } =
      context;

    if (!timePrediction || !timePrediction.timeline) return [];

    const elements: any[] = [];

    // Iterate through timeline to find occurrences of this rotate
    timePrediction.timeline.forEach((ev: any) => {
      // Check if this timeline event corresponds to our rotate item
      // Note: Rotate events appear as type "wait" with waitId matching the rotate ID in timeline generation currently
      if (ev.type !== "wait" || ev.waitId !== rotateItem.id || !ev.atPoint)
        return;

      // Only render if there are event markers on this rotate
      if (rotateItem.eventMarkers && rotateItem.eventMarkers.length > 0) {
        const point = ev.atPoint;

        rotateItem.eventMarkers.forEach((marker: any, idx: number) => {
          const isHovered = hoveredId === marker.id;
          const radiusMult = isHovered ? 1.3 : 0.9;

          const markerGroup = new Two.Group();
          markerGroup.id = `rotate-event-${rotateItem.id}-${idx}`;

          const markerCircle = new Two.Circle(
            x(point.x),
            y(point.y),
            uiLength(POINT_RADIUS * radiusMult),
          );
          markerCircle.id = `rotate-event-circle-${rotateItem.id}-${idx}`;

          const rotateSelected = selectedPointId === `rotate-${rotateItem.id}`;

          if (rotateSelected) {
            markerCircle.fill = "#f97316";
            markerCircle.stroke = "#fffbeb";
            markerCircle.linewidth = uiLength(0.6);
          } else {
            markerCircle.fill = isHovered ? "#06b6d4" : "#67e8f9";
            markerCircle.stroke = "#ffffff";
            markerCircle.linewidth = uiLength(0.3);
          }

          const arrowSize = uiLength(isHovered ? 1 : 0.6);
          const arrowPoints = [
            new Two.Anchor(
              x(point.x) - arrowSize / 3,
              y(point.y) - arrowSize / 3,
            ),
            new Two.Anchor(
              x(point.x) + arrowSize / 3,
              y(point.y) - arrowSize / 3,
            ),
            new Two.Anchor(x(point.x) + arrowSize / 3, y(point.y)),
            new Two.Anchor(x(point.x), y(point.y)),
            new Two.Anchor(x(point.x), y(point.y) + arrowSize / 3),
          ];
          const arrow = new Two.Path(arrowPoints, false);
          arrow.fill = "none";
          arrow.stroke = rotateSelected ? "#fffbeb" : "#ffffff";
          arrow.linewidth = uiLength(0.3);
          arrow.cap = "round";
          arrow.join = "round";
          arrow.id = `rotate-event-arrow-${rotateItem.id}-${idx}`;

          markerGroup.add(markerCircle, arrow);
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
    const rotateItem = item as SequenceRotateItem;
    const degrees = rotateItem.degrees || 0;
    const radians = (degrees * Math.PI) / 180;
    const stateStep = context.stateStep || 0;

    let code = `
        case ${stateStep}:
          follower.turnTo(${radians.toFixed(3)});
          setPathState(${stateStep + 1});
          break;

        case ${stateStep + 1}:
          if(!follower.isBusy()) {
            setPathState(${stateStep + 2});
          }
          break;`;

    return { code, stepsUsed: 2 };
  },

  toSequentialCommand: (
    item: SequenceItem,
    context: CodeExportContext,
  ): string => {
    const rotateItem = item as SequenceRotateItem;
    const degrees = rotateItem.degrees || 0;
    const radians = (degrees * Math.PI) / 180;
    const isNextFTC = context.isNextFTC || false;

    // Define classes based on library
    const InstantCmdClass = "InstantCommand";
    const WaitUntilCmdClass = isNextFTC ? "WaitUntil" : "WaitUntilCommand";
    const ParallelRaceClass = isNextFTC
      ? "ParallelRaceGroup"
      : "ParallelRaceGroup";
    const SequentialGroupClass = isNextFTC
      ? "SequentialGroup"
      : "SequentialCommandGroup";

    const markers: any[] = Array.isArray(rotateItem.eventMarkers)
      ? [...rotateItem.eventMarkers]
      : [];

    if (markers.length === 0) {
      return `new ${InstantCmdClass}(() -> follower.turnTo(${radians.toFixed(3)})),
                new ${WaitUntilCmdClass}(() -> !follower.isTurning())`;
    }

    // Sort markers
    markers.sort((a, b) => (a.position || 0) - (b.position || 0));

    const firstMarker = markers[0];
    let turnCommand = `new ${InstantCmdClass}(() -> {
                        progressTracker.turn(${radians.toFixed(3)}, "${firstMarker.name}", ${firstMarker.position.toFixed(3)});`;

    // Register remaining markers
    for (let i = 1; i < markers.length; i++) {
      turnCommand += `
                        progressTracker.registerEvent("${markers[i].name}", ${markers[i].position.toFixed(3)});`;
    }
    turnCommand += `
                    })`;

    let eventSequence = `new ${ParallelRaceClass}(
                    new ${WaitUntilCmdClass}(() -> !follower.isTurning()),
                    new ${SequentialGroupClass}(`;

    markers.forEach((marker, idx) => {
      if (idx > 0) eventSequence += `,`;
      eventSequence += `
                        new ${WaitUntilCmdClass}(() -> progressTracker.shouldTriggerEvent("${marker.name}")),
                        new ${InstantCmdClass}(() -> progressTracker.executeEvent("${marker.name}"))`;
    });

    eventSequence += `,
                        new ${WaitUntilCmdClass}(() -> !follower.isTurning())`;

    eventSequence += `
                    ))`;

    // Combine them
    return `${turnCommand},
                ${eventSequence}`;
  },

  calculateTime: (
    item: SequenceItem,
    context: TimeCalculationContext,
  ): TimeCalculationResult => {
    const rotateItem = item as SequenceRotateItem;
    const { currentTime, currentHeading, lastPoint, settings } = context;

    // Calculate rotation duration
    const targetHeading = unwrapAngle(rotateItem.degrees, currentHeading);
    const diff = Math.abs(currentHeading - targetHeading);
    const rotTime = calculateRotationTime(diff, settings);

    if (rotTime <= 0) {
      return { events: [], duration: 0, endHeading: targetHeading };
    }

    const event = {
      type: "wait" as const, // Reuse wait type for stationary actions
      name: rotateItem.name,
      duration: rotTime,
      startTime: currentTime,
      endTime: currentTime + rotTime,
      waitId: rotateItem.id,
      startHeading: currentHeading,
      targetHeading: targetHeading,
      atPoint: lastPoint,
    };

    return {
      events: [event],
      duration: rotTime,
      endHeading: targetHeading,
    };
  },
};
