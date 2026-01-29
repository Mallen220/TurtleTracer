<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { tick } from "svelte";
  import type {
    Point,
    Line,
    SequenceItem,
    Settings,
    TimePrediction,
  } from "../../../types";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath } from "../../../stores";
  import { formatTime } from "../../../utils";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let settings: Settings;
  export let timePrediction: any; // Type is loose because TimePrediction might be complex
  export let twoInstance: any = null; // Two.js instance

  let fieldContainer: HTMLDivElement;
  let dialogRef: HTMLDivElement;

  function renderField() {
    if (!fieldContainer || !twoInstance) return;

    // Clear previous content
    fieldContainer.innerHTML = "";

    // Clone the SVG from the main renderer
    // We assume twoInstance.renderer.domElement is the <svg> element.
    const originalSvg = twoInstance.renderer.domElement;
    const svg = originalSvg.cloneNode(true) as SVGElement;

    // Adjust styles for the preview/print
    svg.style.position = "static";
    svg.style.width = "100%";
    svg.style.height = "auto";
    svg.style.maxWidth = "100%";
    svg.style.display = "block";
    svg.style.overflow = "visible"; // Ensure everything is visible

    // Optional: We could traverse the SVG to hide specific groups if needed
    // e.g. hiding the robot image if it's an overlay in the SVG (but robot is usually an <img> overlay in FieldRenderer, not part of Two.js scene except for onion skins)
    // The FieldRenderer uses <img> for the robot, so it WON'T be in the SVG clone.
    // That's actually good for a strategy sheet (we usually just want the path).
    // If we want the robot start position, we might need to add it manually or rely on the start point marker which IS in the Two.js scene.

    // Apply rotation if needed
    if (settings.fieldRotation) {
      svg.style.transform = `rotate(${settings.fieldRotation}deg)`;
      svg.style.transformOrigin = "center";
    }

    fieldContainer.appendChild(svg);
  }

  $: if (isOpen) {
    tick().then(() => {
      renderField();
      if (dialogRef) dialogRef.focus();
    });
  }

  function handlePrint() {
    window.print();
  }

  function handleClose() {
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    }
  }

  // Helpers for table data
  function getSegmentName(line: Line, index: number) {
    return line.name || `Path ${index + 1}`;
  }

  function getEventsForLine(line: Line) {
    return line.eventMarkers || [];
  }

  // Combine Path and Waits into a linear list for the table
  // We can try to reconstruct the order from the sequence
  $: combinedSequence = (() => {
    const items: Array<{
      type: "path" | "wait" | "macro";
      name: string;
      details: string;
      events: string[];
      duration?: number;
    }> = [];

    // Helper to find line by ID
    const findLine = (id: string) => lines.find((l) => l.id === id);

    // Initial Start
    // items.push({ type: 'start', name: 'Start', details: `(${startPoint.x.toFixed(1)}, ${startPoint.y.toFixed(1)})`, events: [] });

    // Iterate Sequence
    sequence.forEach((seqItem, idx) => {
      if (seqItem.kind === "path") {
        const line = findLine(seqItem.lineId);
        if (line) {
          const events = (line.eventMarkers || []).map(
            (e) => `${e.name} @ ${(e.position * 100).toFixed(0)}%`,
          );
          items.push({
            type: "path",
            name: line.name || `Path ${lines.indexOf(line) + 1}`,
            details: `-> (${line.endPoint.x.toFixed(1)}, ${line.endPoint.y.toFixed(1)})`,
            events,
            duration: undefined, // Could get from timePrediction if we map it
          });
        }
      } else if (seqItem.kind === "wait") {
        items.push({
          type: "wait",
          name: seqItem.name || "Wait",
          details: `${seqItem.durationMs}ms`,
          events: [],
          duration: seqItem.durationMs / 1000,
        });
      } else if (seqItem.kind === "macro") {
        items.push({
          type: "macro",
          name: seqItem.name,
          details: "Macro",
          events: [],
        });
      }
    });

    return items;
  })();

  $: projectName = $currentFilePath
    ? $currentFilePath.split(/[\\/]/).pop()?.replace(".pp", "")
    : "Untitled Project";
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop (Hidden on Print) -->
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 print:hidden"
    role="presentation"
    on:click|self={handleClose}
  >
    <!-- Dialog Panel -->
    <div
      bind:this={dialogRef}
      transition:fly={{ y: 20, duration: 300 }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-4xl h-[90vh] flex flex-col border border-neutral-200 dark:border-neutral-800 outline-none overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="strategy-sheet-title"
      tabindex="-1"
    >
      <!-- Header (Screen Only) -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0 bg-neutral-50 dark:bg-neutral-800/50"
      >
        <h2
          id="strategy-sheet-title"
          class="text-lg font-semibold text-neutral-900 dark:text-white"
        >
          Strategy Sheet Preview
        </h2>
        <div class="flex items-center gap-2">
          <button
            on:click={handlePrint}
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6.72 13.829c-.24.03-.48.062-.72.096m.72-.096a42.415 42.415 0 0 1 10.56 0m-10.56 0L6.34 18m10.94-4.171c.24.03.48.062.72.096m-.72-.096L17.66 18m0 0 .229 2.523a1.125 1.125 0 0 1-1.12 1.227H7.231c-.662 0-1.18-.568-1.12-1.227L6.34 18m11.318 0h1.091A2.25 2.25 0 0 0 21 15.75V9.456c0-1.081-.768-2.015-1.837-2.175a48.055 48.055 0 0 0-1.913-.247M6.34 18H5.25A2.25 2.25 0 0 1 3 15.75V9.456c0-1.081.768-2.015-1.837-2.175a48.041 48.041 0 0 1 1.913-.247m10.5 0a48.536 48.536 0 0 0-10.5 0m10.5 0V3.375c0-.621-.504-1.125-1.125-1.125h-8.25c-.621 0-1.125.504-1.125 1.125v3.659M18 10.5h.008v.008H18V10.5Zm-3 0h.008v.008H15V10.5Z"
              />
            </svg>
            Print
          </button>
          <button
            on:click={handleClose}
            class="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-5"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      </div>

      <!-- Preview Content (Scrollable) -->
      <div class="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-8">
        <!-- Printable Sheet -->
        <div
          class="bg-white text-black max-w-[210mm] mx-auto shadow-xl p-[10mm] min-h-[297mm] flex flex-col gap-6 print:shadow-none print:p-0 print:max-w-none print:min-h-0 print:h-auto"
        >
          <!-- Sheet Header -->
          <div
            class="flex items-start justify-between border-b-2 border-black pb-4"
          >
            <div>
              <h1 class="text-3xl font-bold uppercase tracking-tight">
                {projectName}
              </h1>
              <div class="text-sm text-gray-600 mt-1">
                Generated {new Date().toLocaleDateString()}
              </div>
            </div>
            <div class="text-right">
              <div class="text-xl font-bold">
                {formatTime(timePrediction?.totalTime ?? 0)}
              </div>
              <div class="text-sm text-gray-600">Estimated Duration</div>
            </div>
          </div>

          <!-- Top Section: Field and Stats -->
          <div class="flex flex-row gap-6">
            <!-- Field Image -->
            <div class="w-1/2 flex flex-col gap-2">
              <div
                class="aspect-square border border-gray-300 rounded overflow-hidden relative bg-white"
              >
                <!-- Field SVG Container -->
                <div bind:this={fieldContainer} class="w-full h-full p-2"></div>
              </div>
            </div>

            <!-- Stats & Robot Info -->
            <div class="w-1/2 flex flex-col gap-4">
              <div class="border border-gray-300 rounded p-4">
                <h3 class="font-bold border-b border-gray-200 pb-2 mb-2">
                  Statistics
                </h3>
                <div class="grid grid-cols-2 gap-y-2 text-sm">
                  <div class="text-gray-600">Total Time:</div>
                  <div class="font-medium">
                    {formatTime(timePrediction?.totalTime ?? 0)}
                  </div>
                  <div class="text-gray-600">Total Distance:</div>
                  <div class="font-medium">
                    {(timePrediction?.totalDistance ?? 0).toFixed(1)} in
                  </div>
                  <div class="text-gray-600">Path Segments:</div>
                  <div class="font-medium">{lines.length}</div>
                  <div class="text-gray-600">Est. Voltage Usage:</div>
                  <div class="font-medium text-gray-400 italic">N/A</div>
                </div>
              </div>

              <div class="border border-gray-300 rounded p-4 flex-1">
                <h3 class="font-bold border-b border-gray-200 pb-2 mb-2">
                  Robot Profile
                </h3>
                <div class="grid grid-cols-2 gap-y-2 text-sm">
                  <div class="text-gray-600">Width:</div>
                  <div class="font-medium">{settings.rWidth}"</div>
                  <div class="text-gray-600">Length:</div>
                  <div class="font-medium">{settings.rLength}"</div>
                  <div class="text-gray-600">Max Vel:</div>
                  <div class="font-medium">{settings.maxVelocity} in/s</div>
                  <div class="text-gray-600">Max Accel:</div>
                  <div class="font-medium">
                    {settings.maxAcceleration} in/s²
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Path Table -->
          <div>
            <h3 class="font-bold text-lg mb-2">Path Sequence</h3>
            <table class="w-full text-sm border-collapse">
              <thead>
                <tr class="bg-gray-100 border-b border-gray-300">
                  <th class="py-2 px-3 text-left font-bold w-12">#</th>
                  <th class="py-2 px-3 text-left font-bold">Action</th>
                  <th class="py-2 px-3 text-left font-bold">Details</th>
                  <th class="py-2 px-3 text-left font-bold">Events</th>
                </tr>
              </thead>
              <tbody>
                <tr class="border-b border-gray-200">
                  <td class="py-2 px-3 text-gray-500">0</td>
                  <td class="py-2 px-3 font-medium">Start</td>
                  <td class="py-2 px-3"
                    >({startPoint.x.toFixed(1)}, {startPoint.y.toFixed(1)})</td
                  >
                  <td class="py-2 px-3"></td>
                </tr>
                {#each combinedSequence as item, i}
                  <tr class="border-b border-gray-200 break-inside-avoid">
                    <td class="py-2 px-3 text-gray-500">{i + 1}</td>
                    <td class="py-2 px-3 font-medium capitalize">{item.name}</td
                    >
                    <td class="py-2 px-3">{item.details}</td>
                    <td class="py-2 px-3">
                      {#if item.events.length > 0}
                        <div class="flex flex-wrap gap-1">
                          {#each item.events as event}
                            <span
                              class="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-xs"
                              >{event}</span
                            >
                          {/each}
                        </div>
                      {/if}
                    </td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>

          <!-- Notes Section -->
          <div class="flex-1 flex flex-col">
            <h3 class="font-bold text-lg mb-2">Strategy Notes</h3>
            <div class="border-t border-gray-300 flex-1 min-h-[150px]">
              {#each Array(6) as _, i}
                <div class="border-b border-gray-300 h-10 w-full"></div>
              {/each}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  @media print {
    :global(body > *) {
      display: none !important;
    }

    /* Make the backdrop visible (as a container), but hide its background */
    :global(.fixed.inset-0.z-\[1000\]) {
      display: flex !important;
      position: absolute !important;
      inset: 0 !important;
      background: white !important;
      padding: 0 !important;
      align-items: flex-start !important;
      justify-content: center !important;
    }

    /* Hide the dialog header/chrome */
    :global(.fixed.inset-0 > div > div:first-child) {
      display: none !important;
    }

    /* Target the scrollable container and make it visible/overflow visible */
    :global(.fixed.inset-0 > div > div.flex-1) {
      overflow: visible !important;
      padding: 0 !important;
      background: white !important;
    }

    /* Target the sheet itself */
    :global(.fixed.inset-0 > div > div.flex-1 > div) {
      box-shadow: none !important;
      max-width: none !important;
      width: 100% !important;
      margin: 0 !important;
    }

    /* Ensure the dialog panel wrapper itself is visible and reset styles */
    :global(.fixed.inset-0 > div) {
      display: block !important;
      position: static !important;
      width: 100% !important;
      height: auto !important;
      max-width: none !important;
      box-shadow: none !important;
      border: none !important;
      overflow: visible !important;
      background: white !important;
      transform: none !important; /* Reset fly transition transform if caught mid-animation */
    }
  }
</style>
