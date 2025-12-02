<script lang="ts">
  import _ from "lodash";
  import { getRandomColor, createTriangle } from "../utils";

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
  export let settings: FPASettings;
  export let handleSeek: (percent: number) => void;
  export let animationDuration: number;
  export let loopAnimation: boolean;
  export let resetAnimation: () => void;

  export let shapes: Shape[];

  let collapsedEventMarkers: boolean[] = lines.map(() => false);

  // State for collapsed sections
  let collapsedSections = {
    obstacles: shapes.map(() => true),
    lines: lines.map(() => false),
    controlPoints: lines.map(() => true), // Start with control points collapsed
  };

  // Toggle functions
  function toggleObstacle(index: number) {
    collapsedSections.obstacles[index] = !collapsedSections.obstacles[index];
    collapsedSections.obstacles = [...collapsedSections.obstacles]; // Force reactivity
  }

  // Function to toggle all obstacles at once
  function toggleAllObstacles() {
    const allCollapsed = collapsedSections.obstacles.every((c) => c);
    collapsedSections.obstacles = collapsedSections.obstacles.map(
      () => !allCollapsed,
    );
  }
  function toggleLine(index: number) {
    collapsedSections.lines[index] = !collapsedSections.lines[index];
  }

  function toggleControlPoints(index: number) {
    collapsedSections.controlPoints[index] =
      !collapsedSections.controlPoints[index];
  }

  // Function to toggle event markers visibility
  function toggleEventMarkers(index: number) {
    collapsedEventMarkers[index] = !collapsedEventMarkers[index];
    collapsedEventMarkers = [...collapsedEventMarkers]; // Force reactivity
  }

  // Function to add event marker to a line
  function addEventMarker(lineIndex: number) {
    if (!lines[lineIndex].eventMarkers) {
      lines[lineIndex].eventMarkers = [];
    }
    lines[lineIndex].eventMarkers!.push({
      id: `event-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      name: `Event_${lineIndex + 1}_${lines[lineIndex].eventMarkers!.length + 1}`,
      position: 0.5,
      lineIndex,
    });
    lines = [...lines]; // Force reactivity
  }

  // Function to remove event marker
  function removeEventMarker(lineIndex: number, eventIndex: number) {
    if (lines[lineIndex].eventMarkers) {
      lines[lineIndex].eventMarkers!.splice(eventIndex, 1);
      lines = [...lines];
    }
  }
</script>

<div class="flex-1 flex flex-col justify-start items-center gap-2 h-full">
  <div
    class="flex flex-col justify-start items-start w-full rounded-lg bg-neutral-50 dark:bg-neutral-900 shadow-md p-4 overflow-y-scroll overflow-x-hidden h-full gap-6"
  >
    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Canvas Options</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">Robot Length:</div>
        <input
          bind:value={robotWidth}
          on:change={() => {
            if (settings) {
              settings.rWidth = robotWidth;
            }
          }}
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-16"
          step="1"
        />
        <div class="font-extralight">Robot Width:</div>
        <input
          bind:value={robotHeight}
          on:change={() => {
            if (settings) {
              settings.rHeight = robotHeight;
            }
          }}
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-16 dark:bg-neutral-950 dark:border-neutral-700"
          step="1"
        />
      </div>
    </div>

    <!-- Collapsible Obstacles Section -->
    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="flex items-center gap-2 w-full">
        <button
          on:click={toggleAllObstacles}
          class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
          title="{collapsedSections.obstacles.every((c) => c)
            ? 'Expand all'
            : 'Collapse all'} obstacles"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-4 transition-transform {collapsedSections.obstacles.every(
              (c) => c,
            )
              ? 'rotate-0'
              : 'rotate-90'}"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="m8.25 4.5 7.5 7.5-7.5 7.5"
            />
          </svg>
          Obstacles ({shapes.length})
        </button>
      </div>

      {#each shapes as shape, shapeIdx}
        <div
          class="flex flex-col w-full justify-start items-start gap-1 p-2 border rounded-md border-neutral-300 dark:border-neutral-600 mt-2"
        >
          <div class="flex flex-row w-full justify-between items-center">
            <div class="flex flex-row items-center gap-2">
              <button
                on:click={() => toggleObstacle(shapeIdx)}
                class="flex items-center gap-2 font-medium text-sm hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
                title="{collapsedSections.obstacles[shapeIdx]
                  ? 'Expand'
                  : 'Collapse'} obstacle"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  stroke="currentColor"
                  class="size-4 transition-transform {collapsedSections
                    .obstacles[shapeIdx]
                    ? 'rotate-0'
                    : 'rotate-90'}"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="m8.25 4.5 7.5 7.5-7.5 7.5"
                  />
                </svg>
                Obstacle {shapeIdx + 1}
              </button>

              <input
                bind:value={shape.name}
                placeholder="Obstacle {shapeIdx + 1}"
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-medium"
              />
              <div
                class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
                style="background-color: {shape.color}"
              >
                <input
                  type="color"
                  bind:value={shape.color}
                  class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                  title="Change Obstacle Color"
                />
              </div>
            </div>

            <div class="flex flex-row gap-1">
              <button
                title="Add Vertex"
                on:click={() => {
                  shape.vertices = [...shape.vertices, { x: 50, y: 50 }];
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  class="size-4 stroke-green-500"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
              {#if shapes.length > 0}
                <button
                  title="Remove Shape"
                  on:click={() => {
                    shapes.splice(shapeIdx, 1);
                    shapes = shapes;
                    // Also remove the collapsed state for this obstacle
                    collapsedSections.obstacles.splice(shapeIdx, 1);
                    collapsedSections.obstacles = [
                      ...collapsedSections.obstacles,
                    ];
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    class="size-4 stroke-red-500"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                    />
                  </svg>
                </button>
              {/if}
            </div>
          </div>

          {#if !collapsedSections.obstacles[shapeIdx]}
            {#each shape.vertices as vertex, vertexIdx}
              <div class="flex flex-row justify-start items-center gap-2">
                <div class="font-bold text-sm">{vertexIdx + 1}:</div>
                <div class="font-extralight text-sm">X:</div>
                <input
                  bind:value={vertex.x}
                  type="number"
                  min="0"
                  max="144"
                  step="0.1"
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-24 text-sm"
                />
                <div class="font-extralight text-sm">Y:</div>
                <input
                  bind:value={vertex.y}
                  type="number"
                  min="0"
                  max="144"
                  step="0.1"
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-24 text-sm"
                />
                {#if shape.vertices.length > 3}
                  <button
                    title="Remove Vertex"
                    on:click={() => {
                      shape.vertices.splice(vertexIdx, 1);
                      shape.vertices = shape.vertices;
                    }}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke-width={2}
                      class="size-4 stroke-red-500"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                      />
                    </svg>
                  </button>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      {/each}

      <button
        on:click={() => {
          shapes = [...shapes, createTriangle(shapes.length)];
          // Add a new collapsed state for the new obstacle (default to collapsed)
          collapsedSections.obstacles = [...collapsedSections.obstacles, true];
        }}
        class="font-semibold text-red-500 text-sm flex flex-row justify-start items-center gap-1 mt-2"
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
        <p>Add Obstacle</p>
      </button>
    </div>

    <div class="flex flex-col w-full justify-start items-start gap-0.5 text-sm">
      <div class="font-semibold">Current Robot Position</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">X:</div>
        <div class="w-16">{x.invert(robotXY.x).toFixed(3)}</div>
        <div class="font-extralight">Y:</div>
        <div class="w-16">{y.invert(robotXY.y).toFixed(3)}</div>
        <div class="font-extralight">Heading:</div>
        <div>
          {robotHeading.toFixed(0) === "-0"
            ? "0"
            : -robotHeading.toFixed(0)}&deg;
        </div>
      </div>
    </div>

    <div class="flex flex-col w-full justify-start items-start gap-0.5">
      <div class="font-semibold">Starting Point</div>
      <div class="flex flex-row justify-start items-center gap-2">
        <div class="font-extralight">X:</div>
        <input
          bind:value={startPoint.x}
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
        <div class="font-extralight">Y:</div>
        <input
          bind:value={startPoint.y}
          min="0"
          max="144"
          type="number"
          class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-28 dark:bg-neutral-950 dark:border-neutral-700"
          step="0.1"
        />
      </div>
    </div>

    <!-- Collapsible Path Lines -->
    {#each lines as line, idx}
      <div class="flex flex-col w-full justify-start items-start gap-1">
        <div class="flex flex-row w-full justify-between items-center">
          <div class="flex flex-row items-center gap-2">
            <button
              on:click={() => toggleLine(idx)}
              class="flex items-center gap-2 font-semibold hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors"
              title="{collapsedSections.lines[idx]
                ? 'Expand'
                : 'Collapse'} path"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width={2}
                stroke="currentColor"
                class="size-4 transition-transform {collapsedSections.lines[idx]
                  ? 'rotate-0'
                  : 'rotate-90'}"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m8.25 4.5 7.5 7.5-7.5 7.5"
                />
              </svg>
              Path {idx + 1}
            </button>

            <input
              bind:value={line.name}
              placeholder="Path {idx + 1}"
              class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none text-sm font-semibold"
            />
            <div
              class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
              style="background-color: {line.color}"
            >
              <input
                type="color"
                bind:value={line.color}
                class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                title="Change Path Color"
              />
            </div>
          </div>

          <div class="flex flex-row justify-end items-center gap-1">
            {#if !collapsedSections.lines[idx]}
              <button
                title="Add Control Point"
                on:click={() => {
                  line.controlPoints = [
                    ...line.controlPoints,
                    {
                      x: _.random(36, 108),
                      y: _.random(36, 108),
                    },
                  ];
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  class="size-5 stroke-green-500"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M12 4.5v15m7.5-7.5h-15"
                  />
                </svg>
              </button>
            {/if}

            {#if lines.length > 1}
              <button
                title="Remove Line"
                on:click={() => {
                  let _lns = lines;
                  lines.splice(idx, 1);
                  lines = _lns;
                }}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke-width={2}
                  class="size-5 stroke-red-500"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </button>
            {/if}
          </div>
        </div>

        {#if !collapsedSections.lines[idx]}
          <div
            class={`h-[0.75px] w-full`}
            style={`background: ${line.color}`}
          />

          <div class="flex flex-col justify-start items-start w-full">
            <div class="font-light">Point Position:</div>
            <div class="flex flex-row justify-start items-center gap-2">
              <div class="font-extralight">X:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                type="number"
                min="0"
                max="144"
                bind:value={line.endPoint.x}
              />
              <div class="font-extralight">Y:</div>
              <input
                class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                step="0.1"
                min="0"
                max="144"
                type="number"
                bind:value={line.endPoint.y}
              />

              <select
                bind:value={line.endPoint.heading}
                class=" rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28 text-sm"
                title="The heading style of the robot. 
With constant heading, the robot maintains the same heading throughout the line. 
With linear heading, heading changes linearly between given start and end angles. 
With tangential heading, the heading follows the direction of the line."
              >
                <option value="constant">Constant</option>
                <option value="linear">Linear</option>
                <option value="tangential">Tangential</option>
              </select>

              {#if line.endPoint.heading === "linear"}
                <input
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                  step="1"
                  type="number"
                  min="-180"
                  max="180"
                  bind:value={line.endPoint.startDeg}
                  title="The heading the robot starts this line at (in degrees)"
                />
                <input
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                  step="1"
                  type="number"
                  min="-180"
                  max="180"
                  bind:value={line.endPoint.endDeg}
                  title="The heading the robot ends this line at (in degrees)"
                />
              {:else if line.endPoint.heading === "constant"}
                <input
                  class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-14"
                  step="1"
                  type="number"
                  min="-180"
                  max="180"
                  bind:value={line.endPoint.degrees}
                  title="The constant heading the robot maintains throughout this line (in degrees)"
                />
              {:else if line.endPoint.heading === "tangential"}
                <p class="text-sm font-extralight">Reverse:</p>
                <input
                  type="checkbox"
                  bind:checked={line.endPoint.reverse}
                  title="Reverse the direction the robot faces along the tangential path"
                />
              {/if}
            </div>
          </div>

          {#if !collapsedSections.lines[idx]}
            <!-- Event Markers section -->
            <div class="flex flex-col w-full justify-start items-start mt-2">
              <div class="flex items-center justify-between w-full">
                <button
                  on:click={() => toggleEventMarkers(idx)}
                  class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm"
                  title="{collapsedEventMarkers[idx]
                    ? 'Show'
                    : 'Hide'} event markers"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    stroke="currentColor"
                    class="size-3 transition-transform {collapsedEventMarkers[
                      idx
                    ]
                      ? 'rotate-0'
                      : 'rotate-90'}"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                  Event Markers ({line.eventMarkers?.length || 0})
                </button>
                <button
                  on:click={() => addEventMarker(idx)}
                  class="text-sm text-purple-500 hover:text-purple-600 flex items-center gap-1 px-2 py-1"
                  title="Add Event Marker"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    stroke="currentColor"
                    class="size-4"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M12 4.5v15m7.5-7.5h-15"
                    />
                  </svg>
                  Add Marker
                </button>
              </div>

              {#if !collapsedEventMarkers[idx] && line.eventMarkers && line.eventMarkers.length > 0}
                <div class="w-full mt-2 space-y-2">
                  {#each line.eventMarkers as event, eventIdx}
                    <div
                      class="flex flex-col p-2 border border-purple-300 dark:border-purple-700 rounded-md bg-purple-50 dark:bg-purple-900/20"
                    >
                      <div class="flex items-center justify-between mb-2">
                        <div class="flex items-center gap-2">
                          <div class="w-3 h-3 rounded-full bg-purple-500"></div>
                          <input
                            bind:value={event.name}
                            class="pl-1.5 rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 text-sm w-32"
                            placeholder="Event name"
                            on:change={() => {
                              // Update the array to trigger reactivity
                              line.eventMarkers = [...line.eventMarkers];
                            }}
                          />
                        </div>
                        <!-- Event delete Button -->

                        <button
                          on:click={() => removeEventMarker(idx, eventIdx)}
                          class="text-red-500 hover:text-red-600"
                          title="Remove Event Marker"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width={2}
                            class="size-4"
                            stroke="red"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                            />
                          </svg>
                        </button>
                      </div>

                      <!-- Position Slider and text -->
                      <div class="flex items-center gap-2">
                        <span
                          class="text-xs text-neutral-600 dark:text-neutral-400"
                          >Position:</span
                        >
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.01"
                          value={event.position}
                          class="flex-1 slider"
                          on:input={(e) => {
                            const value = parseFloat(e.target.value);
                            if (!isNaN(value)) {
                              event.position = value;
                              line.eventMarkers = [...line.eventMarkers];
                            }
                          }}
                        />
                        <input
                          type="number"
                          value={event.position}
                          min="0"
                          max="1"
                          step="0.01"
                          class="w-16 px-2 py-1 text-xs rounded-md bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500"
                          on:input={(e) => {
                            // Don't update immediately, just show the typed value
                            // We'll validate on blur or Enter
                          }}
                          on:blur={(e) => {
                            const value = parseFloat(e.target.value);
                            if (isNaN(value) || value < 0 || value > 1) {
                              // Invalid - revert to current value
                              e.target.value = event.position;
                              return;
                            }
                            // Valid - update
                            event.position = value;
                            line.eventMarkers = [...line.eventMarkers];
                          }}
                          on:keydown={(e) => {
                            if (e.key === "Enter") {
                              const value = parseFloat(e.target.value);
                              if (isNaN(value) || value < 0 || value > 1) {
                                // Invalid - revert
                                e.target.value = event.position;
                                e.preventDefault();
                                return;
                              }
                              // Valid - update
                              event.position = value;
                              line.eventMarkers = [...line.eventMarkers];
                              e.target.blur(); // Trigger blur to update
                            }
                          }}
                        />
                      </div>

                      <div
                        class="mt-1 text-xs text-neutral-500 dark:text-neutral-400"
                      >
                        Line {idx + 1}, Position: {event.position.toFixed(2)}
                      </div>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- Collapsible Control Points -->
          {#if line.controlPoints.length > 0}
            <div class="flex flex-col w-full justify-start items-start mt-2">
              <div class="flex items-center gap-2">
                <button
                  on:click={() => toggleControlPoints(idx)}
                  class="flex items-center gap-2 font-light hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-sm"
                  title="{collapsedSections.controlPoints[idx]
                    ? 'Expand'
                    : 'Collapse'} control points"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke-width={2}
                    stroke="currentColor"
                    class="size-3 transition-transform {collapsedSections
                      .controlPoints[idx]
                      ? 'rotate-0'
                      : 'rotate-90'}"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="m8.25 4.5 7.5 7.5-7.5 7.5"
                    />
                  </svg>
                  Control Points ({line.controlPoints.length})
                </button>
              </div>

              {#if !collapsedSections.controlPoints[idx]}
                {#each line.controlPoints as point, idx1}
                  <div class="flex flex-col justify-start items-start mt-1">
                    <div class="font-light">Control Point {idx1 + 1}:</div>
                    <div class="flex flex-row justify-start items-center gap-2">
                      <div class="font-extralight">X:</div>
                      <input
                        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                        step="0.1"
                        type="number"
                        bind:value={point.x}
                        min="0"
                        max="144"
                      />
                      <div class="font-extralight">Y:</div>
                      <input
                        class="pl-1.5 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border-[0.5px] focus:outline-none w-28"
                        step="0.1"
                        type="number"
                        bind:value={point.y}
                        min="0"
                        max="144"
                      />
                      <button
                        title="Remove Control Point"
                        on:click={() => {
                          let _pts = line.controlPoints;
                          _pts.splice(idx1, 1);
                          line.controlPoints = _pts;
                        }}
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke-width={2}
                          class="size-5 stroke-red-500"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            d="M15 12H9m12 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                          />
                        </svg>
                      </button>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}
        {/if}
      </div>
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

  <!-- Play/Pause Button and controls -->

  <div
    class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-row justify-start items-center gap-3 shadow-lg"
  >
    <button
      title="Play/Pause"
      on:click={() => {
        if (playing) {
          pause();
        } else {
          play();
        }
      }}
    >
      {#if !playing}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6 stroke-green-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6 stroke-green-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M15.75 5.25v13.5m-7.5-13.5v13.5"
          />
        </svg>
      {/if}
    </button>

    <!-- Loop Toggle Button -->
    <button
      title={loopAnimation ? "Disable Loop" : "Enable Loop"}
      on:click={() => {
        loopAnimation = !loopAnimation;
        // Update animation controller if it exists
        if (animationController) {
          animationController.setLoop(loopAnimation);
        }
      }}
      class:opacity-100={loopAnimation}
      class:opacity-50={!loopAnimation}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-6 stroke-blue-500"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    </button>

    <input
      bind:value={percent}
      type="range"
      min="0"
      max="100"
      step="0.000001"
      class="w-full appearance-none slider focus:outline-none"
      on:input={(e) => handleSeek(parseFloat(e.target.value))}
    />

    <!-- Add Reset Button -->
    <!-- <button title="Reset Animation" on:click={resetAnimation}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-6 stroke-red-500"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
        />
      </svg>
    </button> -->
  </div>
</div>
