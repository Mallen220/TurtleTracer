<script lang="ts">
  import type { Point, Line, ControlPoint, SequenceItem } from "../../types";
  import {
    snapToGrid,
    showGrid,
    gridSize,
    selectedLineId,
    selectedPointId,
  } from "../../stores";

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  import OptimizationDialog from "./OptimizationDialog.svelte";
  import { tick } from "svelte";
  import ObstaclesSection from "./ObstaclesSection.svelte";
  import TrashIcon from "./icons/TrashIcon.svelte";

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

  // Prevent Svelte unused-export warnings: these are bound from parent and used in markup
  $: shapes;
  $: collapsedObstacles;

  // Ensure these are referenced so the compiler doesn't mark them as unused
  $: _shapesCount = Array.isArray(shapes) ? shapes.length : 0;
  $: _collapsedObstaclesCount = Array.isArray(collapsedObstacles)
    ? collapsedObstacles.length
    : 0;

  // Optimization dialog refs and programmatic control
  let optDialogRef: any = null;
  let optIsRunning: boolean = false;
  let optOptimizedLines: Line[] | null = null;
  let optFailed: boolean = false;

  export async function openAndStartOptimization() {
    optimizationOpen = true;
    await tick();
    if (optDialogRef && optDialogRef.startOptimization)
      optDialogRef.startOptimization();
  }

  export function stopOptimization() {
    if (optDialogRef && optDialogRef.stopOptimization)
      optDialogRef.stopOptimization();
  }

  export function applyOptimization() {
    if (optDialogRef && optDialogRef.handleApply) optDialogRef.handleApply();
  }

  export function discardOptimization() {
    if (optDialogRef && optDialogRef.handleClose) optDialogRef.handleClose();
  }

  export function retryOptimization() {
    if (optDialogRef && optDialogRef.startOptimization)
      optDialogRef.startOptimization();
  }

  export function getOptimizationStatus() {
    return {
      isOpen: optimizationOpen,
      isRunning: optIsRunning,
      optimizedLines: optOptimizedLines,
      optimizationFailed: optFailed,
    };
  }

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

  // Debug helper to log mapping between line, index and control points when rows render
  function debugPointRow(
    line: Line,
    cp: ControlPoint | Point | undefined,
    j?: number,
  ) {
    return "";
  }

  // Helper to find the index in the real `sequence` array for a display item
  function findSequenceIndex(item: any) {
    if (!Array.isArray(sequence)) return -1;
    return sequence.findIndex((s) => {
      if ((s as any).kind !== (item as any).kind) return false;
      if ((s as any).kind === "path")
        return (s as any).lineId === (item as any).lineId;
      return (s as any).id === (item as any).id;
    });
  }

  // Ensure UI shows any lines that might be missing from the sequence (robustness)
  $: displaySequence = (() => {
    try {
      // Keep original sequence order and append any missing path items for lines
      const seqCopy = Array.isArray(sequence) ? [...sequence] : [];
      const pathIds = new Set(
        seqCopy
          .filter((s) => (s as any).kind === "path")
          .map((s) => (s as any).lineId),
      );
      lines.forEach((l) => {
        if (!pathIds.has(l.id)) {
          seqCopy.push({ kind: "path", lineId: l.id });
        }
      });
      return seqCopy;
    } catch (e) {
      return sequence || [];
    }
  })();

  // Computed debug values to keep template expressions simple
  $: debugLinesIds = Array.isArray(lines) ? lines.map((l) => l.id) : [];
  $: debugSequenceIds = Array.isArray(sequence)
    ? sequence.map((s) =>
        s.kind === "path" ? (s as any).lineId : (s as any).id,
      )
    : [];
  $: debugDisplayIds = Array.isArray(displaySequence)
    ? displaySequence.map((d) =>
        d.kind === "path" ? (d as any).lineId : (d as any).id,
      )
    : [];
  $: debugMissing = debugLinesIds.filter(
    (id) => !debugSequenceIds.includes(id),
  );
  $: debugInvalidRefs = debugSequenceIds.filter(
    (id) => id && !debugLinesIds.includes(id),
  );

  $: {
    // Optional console logs for development convenience
    try {
      console.info("[WaypointTable] debugLinesIds", debugLinesIds);
      console.info("[WaypointTable] debugSequenceIds", debugSequenceIds);
      console.info("[WaypointTable] debugDisplayIds", debugDisplayIds);
      console.info("[WaypointTable] missing", debugMissing);
      console.info("[WaypointTable] invalidRefs", debugInvalidRefs);
    } catch (err) {
      /* no-op */
    }
  }

  // Drag and drop state
  let draggingIndex: number | null = null;
  let dragOverIndex: number | null = null;
  let dragPosition: "top" | "bottom" | null = null;

  // One-time repair flag for missing sequence items
  let repairedOnce = false;

  function handleDragStart(e: DragEvent, index: number) {
    draggingIndex = index;
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = "move";
      // e.dataTransfer.setDragImage(e.target as Element, 0, 0); // Optional
    }
  }

  function handleDragOver(e: DragEvent, index: number) {
    if (draggingIndex === null) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "top" : "bottom";

    // Start Point special case: cannot drop before it (index -1, top)
    if (index === -1 && position === "top") return;

    e.preventDefault(); // Necessary to allow dropping

    if (dragOverIndex !== index || dragPosition !== position) {
      dragOverIndex = index;
      dragPosition = position;
    }
  }

  function handleDragEnd() {
    draggingIndex = null;
    dragOverIndex = null;
    dragPosition = null;
  }

  function syncLinesToSequence(newSeq: SequenceItem[]) {
    const pathOrder = newSeq
      .filter((item) => item.kind === "path")
      .map((item) => item.lineId);

    const byId = new Map(lines.map((l) => [l.id, l]));
    const reordered: Line[] = [];

    pathOrder.forEach((id) => {
      const l = byId.get(id);
      if (l) {
        reordered.push(l);
        byId.delete(id);
      }
    });

    // Append any lines that are not currently in the sequence to preserve data
    reordered.push(...(byId.values() as Iterable<Line>));

    lines = reordered;

    // Renumber default path names to match the new order
    const renamed = lines.map((l, idx) => {
      if (!l.name || /^Path \d+$/.test(l.name))
        return { ...l, name: `Path ${idx + 1}` };
      return l;
    });
    lines = renamed;
  }

  // Watch for missing sequence entries and repair once to keep UI in sync
  $: if (Array.isArray(lines) && Array.isArray(sequence) && !repairedOnce) {
    const missing = lines.filter(
      (l) =>
        !sequence.some((s) => s.kind === "path" && (s as any).lineId === l.id),
    );
    if (missing.length) {
      console.warn(
        "[WaypointTable] repairing missing sequence items:",
        missing.map((m) => m.id),
      );
      sequence = [
        ...sequence,
        ...missing.map((l) => ({ kind: "path", lineId: l.id })),
      ];
      repairedOnce = true;
      if (recordChange) recordChange();
    }
  }

  // Delete helpers
  function deleteLine(lineId: string) {
    // Prevent deleting the last remaining path
    if (lines.length <= 1) return;

    const idx = lines.findIndex((l) => l.id === lineId);
    if (idx >= 0) {
      lines.splice(idx, 1);
      lines = [...lines];
    }

    // Remove sequence entries that reference this line
    const newSeq = sequence.filter(
      (item) => !(item.kind === "path" && item.lineId === lineId),
    );
    sequence = newSeq;
    syncLinesToSequence(newSeq);

    // Clear selection if it referenced the deleted line
    selectedLineId.set(null);
    selectedPointId.set(null);

    if (recordChange) recordChange();
  }

  function deleteControlPoint(line: Line, cpIndex: number) {
    if (line.locked) return;
    if (cpIndex >= 0 && cpIndex < line.controlPoints.length) {
      line.controlPoints.splice(cpIndex, 1);
      lines = [...lines];
      if (recordChange) recordChange();
      selectedPointId.set(null);
    }
  }

  function deleteWait(index: number) {
    const item = sequence[index];
    if (!item) return;
    if (item.locked) return;

    sequence.splice(index, 1);
    sequence = [...sequence];
    syncLinesToSequence(sequence);
    if (recordChange) recordChange();
    selectedPointId.set(null);
  }
  function handleDrop(e: DragEvent, index: number) {
    e.preventDefault();
    if (draggingIndex === null || draggingIndex === index) {
      handleDragEnd();
      return;
    }

    const fromIndex = draggingIndex;
    let toIndex = index;

    // Logic to reorder sequence
    const item = sequence[fromIndex];
    const newSequence = [...sequence];

    // Remove from old position
    newSequence.splice(fromIndex, 1);

    // Calculate new position
    // If we removed from before the target, the target index shifts down by 1

    let insertIndex = toIndex;
    if (fromIndex < toIndex) {
      insertIndex--;
    }

    if (dragPosition === "bottom") {
      insertIndex++;
    }

    // Safety clamp
    if (insertIndex < 0) insertIndex = 0;
    if (insertIndex > newSequence.length) insertIndex = newSequence.length;

    newSequence.splice(insertIndex, 0, item);
    sequence = newSequence;
    syncLinesToSequence(newSequence);
    recordChange();

    handleDragEnd();
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

  {#if settings?.showDebugSequence}
    <div class="p-2 text-xs text-neutral-500">
      <div>
        <strong>DEBUG</strong> — lines: {lines.length}, sequence: {(
          sequence || []
        ).length}, display: {(displaySequence || []).length}
      </div>
      <div>Missing: {JSON.stringify(debugMissing)}</div>
      <div>Invalid refs: {JSON.stringify(debugInvalidRefs)}</div>
    </div>
  {/if}

  {#if optimizationOpen}
    <div
      class="w-full border border-neutral-200 dark:border-neutral-700 rounded-lg bg-neutral-100 dark:bg-neutral-800 p-4"
    >
      <OptimizationDialog
        bind:this={optDialogRef}
        bind:isRunning={optIsRunning}
        bind:optimizedLines={optOptimizedLines}
        bind:optimizationFailed={optFailed}
        isOpen={true}
        useModal={false}
        {startPoint}
        {lines}
        {settings}
        {sequence}
        {shapes}
        onApply={handleOptimizationApply}
        {onPreviewChange}
        onClose={() => onToggleOptimization && onToggleOptimization()}
      />
    </div>
  {/if}

  <div
    class="w-full overflow-x-auto border rounded-md border-neutral-200 dark:border-neutral-700"
  >
    <table
      class="w-full text-left bg-white dark:bg-neutral-900 border-collapse"
    >
      <thead
        class="bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-400 font-semibold"
      >
        <tr>
          <th class="w-8 px-2 py-2 border-b dark:border-neutral-700"></th>
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
        <tr
          class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors duration-150"
          class:selected={$selectedPointId === "point-0-0"}
          on:click={() => {
            selectedLineId.set(null);
            selectedPointId.set("point-0-0");
          }}
          on:dragover={(e) => handleDragOver(e, -1)}
          on:drop={(e) => handleDrop(e, -1)}
          class:border-b-2={dragOverIndex === -1 && dragPosition === "bottom"}
          class:border-blue-500={dragOverIndex === -1}
          class:dark:border-blue-400={dragOverIndex === -1}
        >
          <td
            class="w-8 px-2 py-2 text-center text-neutral-300 dark:text-neutral-600"
          >
            <!-- No drag handle for Start Point -->
            ●
          </td>
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

        <!-- Sequence Items (displaySequence ensures missing lines are shown) -->
        {#each displaySequence as item, seqIdx (item.kind === "path" ? item.lineId : item.id)}
          {@const seqIndex = findSequenceIndex(item)}
          {#if item.kind === "path"}
            {#each lines.filter((l) => l.id === item.lineId) as line (line.id)}
              {@const lineIdx = lines.findIndex((l) => l === line)}
              <!-- End Point -->
              {@html debugPointRow(line, undefined)}
              {@const endPointId = `point-${lineIdx + 1}-0`}
              <tr
                draggable={!line.locked}
                on:dragstart={(e) => handleDragStart(e, seqIndex)}
                on:dragover={(e) => handleDragOver(e, seqIndex)}
                on:drop={(e) => handleDrop(e, seqIndex)}
                on:dragend={handleDragEnd}
                class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 font-medium ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$selectedPointId === endPointId ? "bg-green-100 dark:bg-green-800/40" : ""} transition-colors duration-150`}
                class:border-t-2={dragOverIndex === seqIndex &&
                  dragPosition === "top"}
                class:border-b-2={dragOverIndex === seqIndex &&
                  dragPosition === "bottom"}
                class:border-blue-500={dragOverIndex === seqIndex}
                class:dark:border-blue-400={dragOverIndex === seqIndex}
                class:opacity-50={draggingIndex === seqIndex}
                on:click={() => {
                  selectedLineId.set(line.id);
                  selectedPointId.set(endPointId);
                }}
              >
                <td
                  class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 20 20"
                    fill="currentColor"
                    class="w-4 h-4 mx-auto"
                  >
                    <path
                      fill-rule="evenodd"
                      d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                      clip-rule="evenodd"
                    />
                  </svg>
                </td>
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
                  <div class="flex items-center gap-2">
                    <input
                      type="number"
                      class="w-20 px-2 py-1 rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                      step={stepSize}
                      value={line.endPoint.x}
                      on:input={(e) => handleInput(e, line.endPoint, "x")}
                      disabled={line.locked}
                    />
                    <span class="text-xs text-neutral-400">/</span>
                    <span class="text-xs text-neutral-500"
                      >{line.waitBeforeName || line.waitBeforeMs || ""}</span
                    >
                  </div>
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
                <td
                  class="px-3 py-2 text-center flex items-center justify-center gap-1"
                >
                  <button
                    title={line.locked ? "Unlock Path" : "Lock Path"}
                    on:click|stopPropagation={() => {
                      line.locked = !line.locked;
                      lines = [...lines];
                      if (recordChange) recordChange();
                    }}
                    class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
                    aria-pressed={line.locked}
                  >
                    {#if line.locked}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="size-5 stroke-yellow-500"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                    {:else}
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke-width="2"
                        stroke="currentColor"
                        class="size-5 stroke-gray-400"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
                        />
                      </svg>
                    {/if}
                  </button>

                  {#if !line.locked && lines.length > 1}
                    <button
                      on:click|stopPropagation={() => deleteLine(line.id)}
                      title="Delete path"
                      class="p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                    >
                      <TrashIcon className="size-4" strokeWidth={2} />
                    </button>
                  {/if}
                </td>
              </tr>

              <!-- Control Points -->
              {#each line.controlPoints as cp, j}
                {@html debugPointRow(line, cp, j)}
                {@const cpIndex = [
                  line.endPoint,
                  ...line.controlPoints,
                ].findIndex((p) => p === cp)}
                {@const pointId = `point-${lineIdx + 1}-${cpIndex}`}
                <tr
                  class={`hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${$selectedLineId === line.id ? "bg-green-50 dark:bg-green-900/20" : ""} ${$selectedPointId === pointId ? "bg-green-100 dark:bg-green-800/40" : ""}`}
                  on:click={() => {
                    selectedLineId.set(line.id);
                    selectedPointId.set(pointId);
                  }}
                  on:dragover={(e) => handleDragOver(e, seqIndex)}
                  on:drop={(e) => handleDrop(e, seqIndex)}
                >
                  <td class="w-8 px-2 py-2">
                    <!-- No drag handle for control points, but they are drop targets for the parent seqIdx -->
                  </td>
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
                      <span title="Locked">🔒</span>
                    {:else}
                      <button
                        on:click|stopPropagation={() =>
                          deleteControlPoint(line, j)}
                        title="Delete control point"
                        class="p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                      >
                        <TrashIcon className="size-4" strokeWidth={2} />
                      </button>
                    {/if}
                  </td>
                </tr>
              {/each}
            {/each}
          {:else if item.kind === "wait"}
            <!-- Wait Item -->
            {@const seqIndex = findSequenceIndex(item)}
            <tr
              draggable={!item.locked}
              on:dragstart={(e) => handleDragStart(e, seqIndex)}
              on:dragover={(e) => handleDragOver(e, seqIndex)}
              on:drop={(e) => handleDrop(e, seqIndex)}
              on:dragend={handleDragEnd}
              class="hover:bg-neutral-50 dark:hover:bg-neutral-800/50 bg-amber-50 dark:bg-amber-900/20 transition-colors duration-150"
              class:border-t-2={dragOverIndex === seqIndex &&
                dragPosition === "top"}
              class:border-b-2={dragOverIndex === seqIndex &&
                dragPosition === "bottom"}
              class:border-blue-500={dragOverIndex === seqIndex}
              class:dark:border-blue-400={dragOverIndex === seqIndex}
              class:opacity-50={draggingIndex === seqIndex}
            >
              <td
                class="w-8 px-2 py-2 text-center cursor-grab active:cursor-grabbing text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  class="w-4 h-4 mx-auto"
                >
                  <path
                    fill-rule="evenodd"
                    d="M10 3a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zm0 5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z"
                    clip-rule="evenodd"
                  />
                </svg>
              </td>
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
                {:else}
                  <button
                    on:click|stopPropagation={() => deleteWait(seqIndex)}
                    title="Delete wait"
                    class="p-0.5 rounded transition-colors text-neutral-400 hover:text-red-600 hover:bg-neutral-50 dark:hover:bg-neutral-800"
                  >
                    <TrashIcon className="size-4" strokeWidth={2} />
                  </button>
                {/if}
              </td>
            </tr>
          {/if}
        {/each}
      </tbody>
    </table>
  </div>
  <div class="text-xs text-neutral-500 dark:text-neutral-500 px-1">
    * Coordinates in inches. 0,0 is bottom-left. Drag handle to reorder.
  </div>
</div>
