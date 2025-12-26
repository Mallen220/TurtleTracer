<script lang="ts">
  import type { Point, Line, ControlPoint, SequenceItem } from "../../types";
  import { snapToGrid, showGrid, gridSize } from "../../stores";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let recordChange: () => void;

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
