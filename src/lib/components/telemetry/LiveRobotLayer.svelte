<script lang="ts">
  import { robotPose } from "../../telemetryStore";
  import type { ScaleFunction } from "../../../types";
  import { DEFAULT_ROBOT_LENGTH, DEFAULT_ROBOT_WIDTH } from "../../../config";

  export let x: ScaleFunction;
  export let y: ScaleFunction;
  export let robotLength = DEFAULT_ROBOT_LENGTH;
  export let robotWidth = DEFAULT_ROBOT_WIDTH;
  export let overridePose: { x: number; y: number; heading: number } | null = null;

  $: pose = overridePose || $robotPose;

  // Convert Heading from Radians to Degrees and negate for CSS/SVG rotation (CCW -> CW)
  // If overridePose is used (from logs/history), heading might already be in degrees or radians?
  // TelemetryPoint in store has heading.
  // My update to `processTelemetryMessage` converted live heading (rad) to degrees for `telemetryData`.
  // `TelemetryDialog` parses CSV/JSON which likely has degrees (standard legacy).
  // So `telemetryData` store has DEGREES.
  // `$robotPose` (live) has RADIANS.
  // This is a unit mismatch.
  // I should standardize.
  // If `pose` comes from `$robotPose`, convert.
  // If `pose` comes from `overridePose` (from FieldRenderer -> ghostRobotState -> telemetryData), it is DEGREES.

  // Logic:
  // If overridePose, assume degrees (legacy).
  // If $robotPose, assume radians (new).

  $: rotation = (() => {
      if (overridePose) {
          // Legacy: Degrees. Negate for CSS?
          // FieldRenderer used `rotate(${heading}deg)`.
          // If heading is CCW deg, CSS needs -heading.
          return -overridePose.heading;
      }
      if ($robotPose) {
          return -($robotPose.heading * 180 / Math.PI);
      }
      return 0;
  })();

  // Calculate pixel dimensions
  $: widthPx = Math.abs(x(robotLength) - x(0));
  $: heightPx = Math.abs(x(robotWidth) - x(0));
</script>

{#if pose}
  <g transform="translate({x(pose.x)}, {y(pose.y)}) rotate({rotation})">
    <rect
      x={-widthPx/2}
      y={-heightPx/2}
      width={widthPx}
      height={heightPx}
      fill="rgba(0, 255, 0, 0.2)"
      stroke="#22c55e"
      stroke-width="2"
      stroke-dasharray="8 4"
      pointer-events="none"
    />
    <!-- Orientation line (forward direction) -->
    <!-- Assuming standard: 0 degrees is right (positive X). But in robot frame? -->
    <!-- Usually 0 is 'forward' relative to chassis? Or 0 is right? -->
    <!-- If chassis is rectangle, length is X-axis size? -->
    <!-- Let's draw a line from center to right edge (local X) -->
    <line x1="0" y1="0" x2={widthPx/2} y2="0" stroke="#22c55e" stroke-width="2" />

    <!-- Center Point -->
    <circle cx="0" cy="0" r="2" fill="#22c55e" />
  </g>
{/if}
