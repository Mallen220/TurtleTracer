<script lang="ts">
  import _ from "lodash";
  import { getRandomColor } from "../utils";
  import ObstaclesSection from "./components/ObstaclesSection.svelte";
  import RobotPositionDisplay from "./components/RobotPositionDisplay.svelte";
  import StartingPointSection from "./components/StartingPointSection.svelte";
  import PathLineSection from "./components/PathLineSection.svelte";
  import PlaybackControls from "./components/PlaybackControls.svelte";

  export let percent: number;
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let startPoint: Point;
  export let lines: Line[];
  export let robotWidth: number = 16;
  export let robotHeight: number = 16;
  export let robotXY: BasePoint;
  export let robotHeading: number;
  export let x: d3.ScaleLinear<number, number, number>;
  export let y: d3.ScaleLinear<number, number, number>;
  export let settings: Settings;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;

  export let shapes: Shape[];

  let collapsedEventMarkers: boolean[] = lines.map(() => false);

  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  function insertLineAfter(index) {
    const currentLine = lines[index];

    // Calculate a new point offset from the current line's end point
    const newPoint = {
      x: _.random(36, 108),
      y: _.random(36, 108),
      heading: currentLine.endPoint.heading,
      // Copy heading properties based on type
      ...(currentLine.endPoint.heading === "linear" && {
        startDeg: currentLine.endPoint.startDeg,
        endDeg: currentLine.endPoint.endDeg,
      }),
      ...(currentLine.endPoint.heading === "constant" && {
        degrees: currentLine.endPoint.degrees,
      }),
      ...(currentLine.endPoint.heading === "tangential" && {
        reverse: currentLine.endPoint.reverse,
      }),
    };

    // Create a new line that starts where the current line ends
    const newLine = {
      endPoint: newPoint,
      controlPoints: [],
      color: getRandomColor(),
      name: `Path ${lines.length + 1}`,
      eventMarkers: [],
    };

    // Insert the new line after the current one
    const newLines = [...lines];
    newLines.splice(index + 1, 0, newLine);
    lines = newLines;

    collapsedSections.lines.splice(index + 1, 0, false);
    collapsedSections.controlPoints.splice(index + 1, 0, true);
    collapsedEventMarkers.splice(index + 1, 0, false);

    // Force reactivity
    collapsedSections = { ...collapsedSections };
    collapsedEventMarkers = [...collapsedEventMarkers];
  }

  function removeLine(idx: number) {
    let _lns = lines;
    lines.splice(idx, 1);
    lines = _lns;
  }
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <ObstaclesSection
      bind:shapes
      bind:collapsedObstacles={collapsedSections.obstacles}
    />

    <RobotPositionDisplay {robotXY} {robotHeading} {x} {y} />

    <StartingPointSection bind:startPoint />

    <!-- Collapsible Path Lines -->
    {#each lines as line, idx}
      <PathLineSection
        bind:line
        {idx}
        bind:lines
        bind:collapsed={collapsedSections.lines[idx]}
        bind:collapsedEventMarkers={collapsedEventMarkers[idx]}
        bind:collapsedControlPoints={collapsedSections.controlPoints[idx]}
        onRemove={() => removeLine(idx)}
        onInsertAfter={() => insertLineAfter(idx)}
      />
    {/each}

    <!-- Add Line Button -->
    <button
      on:click={() => {
        lines = [
          ...lines,
          {
            name: `Path ${lines.length + 1}`,
            endPoint: {
              x: _.random(0, 144),
              y: _.random(0, 144),
              heading: "tangential",
              reverse: false,
            },
            controlPoints: [],
            color: getRandomColor(),
          },
        ];
        // Add new collapsed state for the new line
        collapsedSections.lines.push(false);
        collapsedSections.controlPoints.push(true);
      }}
      class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width={2}
        stroke="currentColor"
        class="size-5"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M12 4.5v15m7.5-7.5h-15"
        />
      </svg>
      <p>Add Line</p>
    </button>
  </div>

  <PlaybackControls
    bind:playing
    {play}
    {pause}
    bind:percent
    {handleSeek}
    bind:loopAnimation
  />
</div>
