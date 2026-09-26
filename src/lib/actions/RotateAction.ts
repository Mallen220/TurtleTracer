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
import RotateTableRow from "../components/table/RotateTableRow.svelte";
import RotateSection from "../components/sections/RotateSection.svelte";
import type { SequenceItem, SequenceRotateItem } from "../../types";
import { stationaryMarkerElements } from "./stationaryMarkers";
import { calculateRotationTime, unwrapAngle } from "../../utils/timeCalculator";
import { makeId } from "../../utils/nameGenerator";

/** A new turn to 0°. */
export const createRotate = (): SequenceRotateItem => ({
  kind: "rotate",
  id: makeId(),
  name: "",
  degrees: 0,
  locked: false,
});

export const RotateAction: ActionDefinition = {
  kind: "rotate",
  label: "Rotate",
  buttonColor: "pink",
  isRotate: true,
  color: "#ec4899", // Pink-500
  showInToolbar: true,
  button: {
    label: "Add Rotate",
  },
  component: RotateTableRow,
  sectionComponent: RotateSection,

  createDefault: createRotate,

  onInsert: (ctx: InsertionContext) => {
    ctx.sequence.splice(ctx.index, 0, createRotate());
    ctx.triggerReactivity();
  },

  renderField: (item: SequenceItem, context: FieldRenderContext) =>
    stationaryMarkerElements(item as SequenceRotateItem, context, {
      prefix: "rotate",
      fill: "#67e8f9",
      hoverFill: "#06b6d4",
      glyphName: "arrow",
      // A small hooked arrow
      glyph: (px, py, size, color, uiLength) => {
        const d = size / 3;
        const arrow = new Two.Path(
          [
            new Two.Anchor(px - d, py - d),
            new Two.Anchor(px + d, py - d),
            new Two.Anchor(px + d, py),
            new Two.Anchor(px, py),
            new Two.Anchor(px, py + d),
          ],
          false,
        );
        arrow.fill = "none";
        arrow.stroke = color;
        arrow.linewidth = uiLength(0.3);
        arrow.cap = "round";
        arrow.join = "round";
        return arrow;
      },
    }),

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
          follower.hold(follower.pose().withHeading(${radians.toFixed(3)}));
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
    const ParallelRaceClass = "ParallelRaceGroup"; // Same for NextFTC and SolversLib
    const SequentialGroupClass = isNextFTC
      ? "SequentialGroup"
      : "SequentialCommandGroup";

    const markers = (rotateItem.eventMarkers ?? []).toSorted(
      (a, b) => (a.position || 0) - (b.position || 0),
    );

    if (markers.length === 0) {
      return `new ${InstantCmdClass}(() -> follower.hold(follower.pose().withHeading(${radians.toFixed(3)}))),
                new ${WaitUntilCmdClass}(() -> !follower.isBusy())`;
    }

    const firstMarker = markers[0];
    let turnCommand = `new ${InstantCmdClass}(() -> {
                        follower.hold(follower.pose().withHeading(${radians.toFixed(3)}));
                        progressTracker.turn(${radians.toFixed(3)}, "${firstMarker.name}", ${firstMarker.position.toFixed(3)});`;

    // Register remaining markers
    for (let i = 1; i < markers.length; i++) {
      turnCommand += `
                        progressTracker.registerEvent("${markers[i].name}", ${markers[i].position.toFixed(3)});`;
    }
    turnCommand += `
                    })`;

    let eventSequence = `new ${ParallelRaceClass}(
                    new ${WaitUntilCmdClass}(() -> !follower.isBusy()),
                    new ${SequentialGroupClass}(`;

    markers.forEach((marker, idx) => {
      if (idx > 0) eventSequence += `,`;
      eventSequence += `
                        new ${WaitUntilCmdClass}(() -> progressTracker.shouldTriggerEvent("${marker.name}")),
                        new ${InstantCmdClass}(() -> progressTracker.executeEvent("${marker.name}"))`;
    });

    eventSequence += `,
                        new ${WaitUntilCmdClass}(() -> !follower.isBusy())`;

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
