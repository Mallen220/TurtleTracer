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
import { commandsForContext } from "../exporters/commandLibraries";
import { stateCase } from "../exporters/javaFormat";

/**
 * How close (radians) the robot has to face the heading for a turn to be done:
 * SolversLib's TurnToCommand default, about 0.57°.
 */
const TURN_TOLERANCE = 0.01;

/**
 * Whether the robot faces `radians`, in Java (and Kotlin). Pedro's isBusy()
 * can't tell: in a hold it clears once its timeoutConstraint (100 ms) has
 * passed, turned or not.
 */
const facing = (radians: string) =>
  `Math.abs(com.pedropathing.utils.Angle.error(follower.pose().heading(), ${radians})) < ${TURN_TOLERANCE}`;

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
    const { language } = context;

    const code =
      stateCase(
        stateStep,
        `follower.hold(follower.pose().withHeading(${radians.toFixed(3)}));
          follower.algorithm().reset();
          setPathState(${stateStep + 1});`,
        language,
      ) +
      stateCase(
        stateStep + 1,
        `if(${facing(radians.toFixed(3))}) {
            setPathState(${stateStep + 2});
          }`,
        language,
      );

    return { code, stepsUsed: 2 };
  },

  // Both exports are written through helpers that know Kotlin too.
  supportsKotlin: true,

  toSequentialCommand: (
    item: SequenceItem,
    context: CodeExportContext,
  ): string => {
    const rotateItem = item as SequenceRotateItem;
    const degrees = rotateItem.degrees || 0;
    const radians = (degrees * Math.PI) / 180;
    const commands = commandsForContext(context);
    // Resetting the algorithm restarts its hold, so the robot holds the new
    // heading rather than the end of the last path.
    const holdHeading = `follower.hold(follower.pose().withHeading(${radians.toFixed(3)}));
                        follower.algorithm().reset();`;
    const waitForStop = commands.waitUntil(facing(radians.toFixed(3)));

    const markers = (rotateItem.eventMarkers ?? []).toSorted(
      (a, b) => (a.position || 0) - (b.position || 0),
    );

    if (markers.length === 0) {
      return `${commands.instant(`{
                        ${holdHeading}
                    }`)},
                ${waitForStop}`;
    }

    const firstMarker = markers[0];
    let turnBody = `{
                        ${holdHeading}
                        tracker.turn(${radians.toFixed(3)}, "${firstMarker.name}", ${firstMarker.position.toFixed(3)});`;

    // Register remaining markers
    for (let i = 1; i < markers.length; i++) {
      turnBody += `
                        tracker.registerEvent("${markers[i].name}", ${markers[i].position.toFixed(3)});`;
    }
    turnBody += `
                    }`;
    const turnCommand = commands.instant(turnBody);

    const markerSteps = markers
      .map(
        (marker) => `
                        ${commands.waitUntil(`tracker.shouldTriggerEvent("${marker.name}")`)},
                        ${commands.instant(`tracker.executeEvent("${marker.name}")`)}`,
      )
      .join(",");

    const eventSequence = commands.race(`
                    ${waitForStop},
                    ${commands.sequential(`${markerSteps},
                        ${waitForStop}
                    `)}
                `);

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
