<script lang="ts">
  import type { Point, Line, ControlPoint, SequenceItem } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  import OptimizationDialog from "./OptimizationDialog.svelte";
  import ObstaclesSection from "./ObstaclesSection.svelte";

  export let recordChange: () => void;
  // Handler passed from parent to toggle optimization dialog
  export let onToggleOptimization: () => void;

  // Props for inline optimization panel
  export let optimizationOpen: boolean = false;
  export let handleOptimizationApply: (
    newLines: import("../../types").Line[],
  ) => void;
  export let onPreviewChange: (
    lines: import("../../types").Line[] | null,
  ) => void;
  export let settings: import("../../types").Settings;

  // Shapes and collapsedObstacles binding for ObstaclesSection
  export let shapes: import("../../types").Shape[];
  export let collapsedObstacles: boolean[];

  // Use snap stores to determine step size for inputs
  $: stepSize = $snapToGrid && $showGrid ? $gridSize : 0.1;

  function updatePoint(
    point: Point | ControlPoint,
    field: "x" | "y",
    value: number,
  ) {
    point[field] = value;
    // Trigger reactivity for lines/startPoint
    lines = lines;
    startPoint = startPoint;
    recordChange();
  }

  function handleInput(
    e: Event,
    point: Point | ControlPoint,
    field: "x" | "y",
  ) {
    const input = e.target as HTMLInputElement;
    const val = parseFloat(input.value);
    if (!isNaN(val)) {
      updatePoint(point, field, val);
    }
  }

  function getLine(id: string): Line | undefined {
    return lines.find((l) => l.id === id);
  }

  function getLineIndex(id: string): number {
    return lines.findIndex((l) => l.id === id);
  }

  function updateLineName(lineId: string, name: string) {
    const line = lines.find((l) => l.id === lineId);
    if (line) {
      line.name = name;
      lines = lines; // Trigger reactivity
      recordChange();
    }
  }

  function updateWaitName(item: SequenceItem, name: string) {
    if (item.kind === "wait") {
      item.name = name;
      sequence = sequence; // Trigger reactivity
      recordChange();
    }
  }

  function updateWaitDuration(item: SequenceItem, duration: number) {
    if (item.kind === "wait") {
      item.durationMs = duration;
      sequence = sequence; // Trigger reactivity
      recordChange();
    }
  }
</script>

<div class="w-full flex flex-col gap-4 text-sm p-1">
  <div class="flex justify-between items-center">
    <h3 class="text-sm font-semibold text-neutral-700 dark:text-neutral-200">
      Sequence
    </h3>
    <div class="flex items-center gap-2">
      <button
        title="Optimize Path"
        on:click={() => onToggleOptimization && onToggleOptimization()}
        class="flex flex-row items-center gap-1 hover:bg-neutral-200 dark:hover:bg-neutral-800 px-2 py-1 rounded transition-colors text-purple-500"
      >
        <span>Optimize</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
          />
        </svg>
      </button>
    </div>
  </div>

  {#if optimizationOpen}
    <div
      class="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-4"
    >
      <OptimizationDialog
        isOpen={true}
        useModal={false}
        {startPoint}
        {lines}
        {settings}
        {sequence}
        onApply={handleOptimizationApply}
        {onPreviewChange}
        onClose={() => onToggleOptimization && onToggleOptimization()}
      />
    </div>
  {/if}

  <div
    class="w-full overflow-x-auto border rounded-md border-neutral-200 dark:border-neutral-700"
  >
    <table class="w-full text-left bg-white dark:bg-neutral-900">
      <thead
        class="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-semibold"
      >
        <tr>
          <th class="px-3 py-2 border-b dark:border-neutral-700">Name</th>
          <th class="px-3 py-2 border-b dark:border-neutral-700"
            >X (in) / Dur (ms)</th
          >
          <th class="px-3 py-2 border-b dark:border-neutral-700">Y (in)</th>
          <th class="px-3 py-2 border-b dark:border-neutral-700 w-10"></th>
        </tr>
      </thead>
      <tbody class="divide-y divide-neutral-100 dark:divide-neutral-800">
        <!-- Start Point -->
        <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
          <td
            class="px-3 py-2 font-medium text-neutral-800 dark:text-neutral-200"
          >
            Start Point
          </td>
          <td class="px-3 py-2">
            <input
              type="number"
              class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              step={stepSize}
              value={startPoint.x}
              on:input={(e) => handleInput(e, startPoint, "x")}
              disabled={startPoint.locked}
            />
          </td>
          <td class="px-3 py-2">
            <input
              type="number"
              class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
              step={stepSize}
              value={startPoint.y}
              on:input={(e) => handleInput(e, startPoint, "y")}
              disabled={startPoint.locked}
            />
          </td>
          <td class="px-3 py-2 text-center">
            {#if startPoint.locked}
              <span title="Locked">🔒</span>
            {/if}
          </td>
        </tr>

        <!-- Sequence Items -->
        {#each sequence as item, seqIdx}
          {#if item.kind === "path"}
            {@const line = getLine(item.lineId)}
            {#if line}
              {@const lineIdx = getLineIndex(item.lineId)}
              <!-- Control Points -->
              {#each line.controlPoints as cp, j}
                <tr class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50">
                  <td
                    class="px-3 py-2 pl-8 text-neutral-500 dark:text-neutral-400 text-xs"
                  >
                    ↳ Control {j + 1}
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                      step={stepSize}
                      value={cp.x}
                      on:input={(e) => handleInput(e, cp, "x")}
                      disabled={line.locked}
                    />
                  </td>
                  <td class="px-3 py-2">
                    <input
                      type="number"
                      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-900/50 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                      step={stepSize}
                      value={cp.y}
                      on:input={(e) => handleInput(e, cp, "y")}
                      disabled={line.locked}
                    />
                  </td>
                  <td class="px-3 py-2 text-center">
                    {#if line.locked}
                      <span title="Locked" class="text-xs">🔒</span>
                    {/if}
                  </td>
                </tr>
              {/each}

              <!-- End Point -->
              <tr
                class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-medium"
              >
                <td class="px-3 py-2">
                  <input
                    class="w-full max-w-[160px] px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none text-xs"
                    value={line.name || `Path ${lineIdx + 1}`}
                    on:input={(e) =>
                      // @ts-ignore
                      updateLineName(item.lineId, e.target.value)}
                    disabled={line.locked}
                    placeholder="Path Name"
                  />
                </td>
                <td class="px-3 py-2">
                  <input
                    type="number"
                    class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    step={stepSize}
                    value={line.endPoint.x}
                    on:input={(e) => handleInput(e, line.endPoint, "x")}
                    disabled={line.locked}
                  />
                </td>
                <td class="px-3 py-2">
                  <input
                    type="number"
                    class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    step={stepSize}
                    value={line.endPoint.y}
                    on:input={(e) => handleInput(e, line.endPoint, "y")}
                    disabled={line.locked}
                  />
                </td>
                <td class="px-3 py-2 text-center">
                  {#if line.locked}
                    <span title="Locked">🔒</span>
                  {/if}
                </td>
              </tr>
            {/if}
          {:else if item.kind === "wait"}
            <!-- Wait Item -->
            <tr
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-amber-50 dark:bg-amber-900/20"
            >
              <td class="px-3 py-2">
                <input
                  class="w-full max-w-[160px] px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
                  value={item.name}
                  on:input={(e) =>
                    // @ts-ignore
                    updateWaitName(item, e.target.value)}
                  disabled={item.locked}
                  placeholder="Wait Name"
                />
              </td>
              <td class="px-3 py-2">
                <input
                  type="number"
                  class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-amber-500 focus:outline-none text-xs"
                  min="0"
                  value={item.durationMs}
                  on:input={(e) =>
                    updateWaitDuration(
                      item,
                      // @ts-ignore
                      parseFloat(e.target.value),
                    )}
                  disabled={item.locked}
                />
              </td>
              <td class="px-3 py-2 text-neutral-400 text-xs italic"> - </td>
              <td class="px-3 py-2 text-center">
                {#if item.locked}
                  <span title="Locked">🔒</span>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
  <div class="text-xs text-neutral-500 dark:text-neutral-500 px-1">
    * Coordinates in inches. 0,0 is bottom-left.
  </div>
</div>
