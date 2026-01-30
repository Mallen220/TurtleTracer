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

    // Clone the SVG (or canvas) from the main renderer
    // We expect twoInstance.renderer.domElement to be the <svg> element for Two.js SVG renderer,
    // but some environments or plugins may wrap or change the output, so we'll inspect and handle multiple types.
    const originalEl = twoInstance.renderer?.domElement;

    // Debug: collect info about the renderer element to diagnose missing field map
    const debugInfo: any = {
      twoInstancePresent: !!twoInstance,
      rendererExists: !!originalEl,
      tagName: originalEl?.tagName || null,
      childCount: originalEl ? originalEl.querySelectorAll("*").length : 0,
      outerLength: originalEl ? (originalEl.outerHTML || "").length : 0,
      widthAttr: originalEl?.getAttribute
        ? originalEl.getAttribute("width")
        : null,
      heightAttr: originalEl?.getAttribute
        ? originalEl.getAttribute("height")
        : null,
      viewBox: originalEl?.getAttribute
        ? originalEl.getAttribute("viewBox")
        : null,
    };
    console.debug("StrategySheetPreview renderer debug:", debugInfo);

    let svg: SVGElement | null = null;

    if (!originalEl) {
      // Nothing to render
      const dbg = document.createElement("div");
      dbg.style.padding = "8px";
      dbg.style.background = "rgba(255,0,0,0.05)";
      dbg.style.color = "red";
      dbg.textContent = `StrategySheet: No renderer element available`;
      fieldContainer.appendChild(dbg);
      return;
    }

    // If the renderer is an SVG, clone it
    if (originalEl.tagName && originalEl.tagName.toUpperCase() === "SVG") {
      svg = originalEl.cloneNode(true) as SVGElement;
    } else if (
      originalEl.tagName &&
      originalEl.tagName.toUpperCase() === "CANVAS"
    ) {
      // If it's a canvas, create an image from it
      try {
        const dataUrl = (originalEl as HTMLCanvasElement).toDataURL(
          "image/png",
        );
        const img = document.createElement("img");
        img.src = dataUrl;
        img.style.maxWidth = "70%";
        img.style.height = "auto";
        img.style.display = "block";
        img.style.margin = "0 auto";
        fieldContainer.appendChild(img);
        return;
      } catch (e) {
        console.error(
          "Failed to serialize canvas renderer for strategy sheet preview:",
          e,
        );
      }
    } else {
      // Try to find an inner SVG element
      const innerSvg = originalEl.querySelector
        ? originalEl.querySelector("svg")
        : null;
      if (innerSvg) {
        svg = innerSvg.cloneNode(true) as SVGElement;
      }
    }

    if (!svg) {
      const dbg = document.createElement("div");
      dbg.style.padding = "8px";
      dbg.style.background = "rgba(255,200,0,0.05)";
      dbg.style.color = "#b97300";
      dbg.textContent = `StrategySheet: No SVG element found to render`;
      fieldContainer.appendChild(dbg);
      return;
    }

    // Determine original SVG attributes (if available) so scaling keeps aspect ratio
    const sourceSvg =
      originalEl.tagName && originalEl.tagName.toUpperCase() === "SVG"
        ? originalEl
        : originalEl.querySelector
          ? (originalEl.querySelector("svg") as SVGElement)
          : null;
    const originalWidth =
      sourceSvg?.getAttribute("width") || svg.getAttribute("width") || "800";
    const originalHeight =
      sourceSvg?.getAttribute("height") || svg.getAttribute("height") || "800";
    const viewBox =
      sourceSvg?.getAttribute("viewBox") || svg.getAttribute("viewBox");

    try {
      // Ensure there is a viewBox; if missing, create one from width/height so scaling works
      if (viewBox) {
        svg.setAttribute("viewBox", viewBox);
      } else {
        svg.setAttribute("viewBox", `0 0 ${originalWidth} ${originalHeight}`);
      }
      // Remove fixed pixel width/height so the SVG scales to the container via viewBox
      svg.removeAttribute("width");
      svg.removeAttribute("height");
    } catch (e) {
      console.debug("Failed to set attributes on cloned SVG:", e);
    }

    // Adjust styles for the preview/print and let flexbox center it
    svg.style.position = "static";
    svg.style.display = "block";
    // Make SVG fill the container while maintaining aspect via viewBox
    svg.style.width = "100%";
    svg.style.height = "100%";
    svg.style.maxWidth = "100%";
    svg.style.margin = "0 auto";
    svg.style.zIndex = "2";
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

    // Ensure the SVG has a preserveAspectRatio for consistent scaling
    if (!svg.getAttribute("preserveAspectRatio")) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    }

    // Determine background image source
    let bgSrc: string | null = null;
    if (settings.customMaps?.some((m) => m.id === settings.fieldMap)) {
      const activeMap = settings.customMaps.find(
        (m) => m.id === settings.fieldMap,
      );
      if (activeMap?.imageData) bgSrc = activeMap.imageData;
    } else {
      bgSrc =
        settings.fieldMap && !settings.fieldMap.includes("custom")
          ? `/fields/${settings.fieldMap}`
          : "/fields/decode.webp";
    }

    // If we have an SVG, embed the background image into the svg so it uses the same coordinate system
    if (svg && bgSrc) {
      try {
        const svgViewBox = svg.getAttribute("viewBox");
        let bx = 0,
          by = 0,
          bwidth = 0,
          bheight = 0;

        if (svgViewBox) {
          const parts = svgViewBox.split(/\s+/).map(Number);
          if (parts.length === 4 && parts.every((n) => !Number.isNaN(n))) {
            bx = parts[0];
            by = parts[1];
            bwidth = parts[2];
            bheight = parts[3];
          }
        }

        // Fallback to DOM pixel size if viewBox isn't available or parsing failed
        if (!bwidth || !bheight) {
          const cw = (originalEl as HTMLElement).clientWidth;
          const ch = (originalEl as HTMLElement).clientHeight;
          if (cw && ch) {
            bwidth = cw;
            bheight = ch;
          } else {
            bwidth = parseFloat(originalWidth) || 800;
            bheight = parseFloat(originalHeight) || 800;
          }
        }

        const imgEl = svg.ownerDocument.createElementNS(
          "http://www.w3.org/2000/svg",
          "image",
        );
        // Try both namespaced and non-namespaced href for compatibility
        try {
          imgEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", bgSrc);
        } catch (e) {
          /* ignore */
        }
        imgEl.setAttribute("href", bgSrc);
        imgEl.setAttribute("x", String(bx));
        imgEl.setAttribute("y", String(by));
        imgEl.setAttribute("width", String(bwidth));
        imgEl.setAttribute("height", String(bheight));
        // Use 'none' so the field image maps exactly to the SVG coordinate system
        imgEl.setAttribute("preserveAspectRatio", "none");
        imgEl.style.pointerEvents = "none";
        svg.insertBefore(imgEl, svg.firstChild);
      } catch (e) {
        console.error("Failed to embed background image into SVG:", e);
      }
    }

    // If the cloned SVG has no visible content (some renderers create shadowed canvases),
    // fall back to serializing it and inserting it as an <img> to ensure it appears.
    const hasContent =
      svg &&
      svg.querySelectorAll("*").length > 0 &&
      svg.outerHTML.trim().length > 0;

    if (!hasContent) {
      try {
        const serializer = new XMLSerializer();
        const svgString = serializer.serializeToString(svg);

        // Create background image element (positioned absolutely inside the container)
        if (bgSrc) {
          const bgImg = document.createElement("img");
          bgImg.src = bgSrc;
          bgImg.alt = "Field";
          bgImg.style.maxWidth = "90%";
          bgImg.style.height = "auto";
          bgImg.style.display = "block";
          bgImg.style.position = "absolute";
          bgImg.style.top = "50%";
          bgImg.style.left = "50%";
          bgImg.style.transform = "translate(-50%, -50%)";
          bgImg.style.zIndex = "1";
          bgImg.style.pointerEvents = "none";
          fieldContainer.appendChild(bgImg);
        }

        const img = document.createElement("img");
        img.src =
          "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
        img.alt = "Field overlay";
        // Make fallback images scale with container width so they align with background
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.maxWidth = "100%";
        img.style.display = "block";
        img.style.position = "absolute";
        img.style.top = "0";
        img.style.left = "0";
        img.style.zIndex = "2";
        fieldContainer.appendChild(img);
        return;
      } catch (e) {
        console.error("Failed to serialize SVG for strategy sheet preview:", e);
      }
    }

    // When we have content, prefer rasterizing the source SVG to an image and overlaying it
    try {
      const serializer = new XMLSerializer();
      const sourceSvg =
        originalEl.tagName && originalEl.tagName.toUpperCase() === "SVG"
          ? originalEl
          : svg;
      const svgString = serializer.serializeToString(sourceSvg);

      // Ensure background image is present and fills container
      if (bgSrc) {
        const bgImg = document.createElement("img");
        bgImg.src = bgSrc;
        bgImg.alt = "Field";
        bgImg.style.width = "100%";
        bgImg.style.height = "100%";
        bgImg.style.maxWidth = "100%";
        bgImg.style.display = "block";
        bgImg.style.position = "absolute";
        bgImg.style.top = "0";
        bgImg.style.left = "0";
        bgImg.style.zIndex = "1";
        bgImg.style.pointerEvents = "none";
        fieldContainer.appendChild(bgImg);
      }

      const overlayImg = document.createElement("img");
      overlayImg.src =
        "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svgString);
      overlayImg.alt = "Field overlay";
      overlayImg.style.width = "100%";
      overlayImg.style.height = "100%";
      overlayImg.style.maxWidth = "100%";
      overlayImg.style.display = "block";
      overlayImg.style.position = "absolute";
      overlayImg.style.top = "0";
      overlayImg.style.left = "0";
      overlayImg.style.zIndex = "2";
      overlayImg.style.pointerEvents = "none";
      fieldContainer.appendChild(overlayImg);
      return;
    } catch (e) {
      console.error("Failed to create overlay image from SVG:", e);
    }

    // As a fallback, append the cloned svg element directly
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

  async function handleDownloadPdf() {
    // Dynamic import to avoid bundling issues
    const html2pdf = (await import("html2pdf.js")).default;
    const printableSheet = document.querySelector(
      ".max-w-\\[210mm\\]",
    ) as HTMLElement;
    if (!printableSheet) return;

    const opt = {
      margin: 0,
      filename: `${projectName}-strategy-sheet.pdf`,
      image: { type: "png", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { format: "a4", orientation: "portrait" },
    } as const;

    html2pdf()
      .set(opt as any)
      .from(printableSheet)
      .save();
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

  // Combine Path, Waits, and Rotations into a linear list for the table
  // We can try to reconstruct the order from the sequence
  $: combinedSequence = (() => {
    const items: Array<{
      type: "path" | "wait" | "macro" | "rotate";
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
      } else if (seqItem.kind === "rotate") {
        items.push({
          type: "rotate",
          name: seqItem.name || "Rotate",
          details: `${seqItem.degrees}°`,
          events: (seqItem.eventMarkers || []).map(
            (e) => `${e.name} @ ${(e.position * 100).toFixed(0)}%`,
          ),
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
              width="16"
              height="16"
              fill="currentColor"
              class="bi bi-printer"
              viewBox="0 0 16 16"
            >
              <path d="M2.5 8a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1" />
              <path
                d="M5 1a2 2 0 0 0-2 2v2H2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1v1a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-1h1a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1V3a2 2 0 0 0-2-2zM4 3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2H4zm1 5a2 2 0 0 0-2 2v1H2a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v-1a2 2 0 0 0-2-2zm7 2v3a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1"
              />
            </svg>
            Print
          </button>
          <button
            on:click={handleDownloadPdf}
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
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
                d="M12 3v12"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M8 13l4 4 4-4"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M3 21h18"
              />
            </svg>
            Download PDF
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
                <div
                  id="strategy-sheet-preview-field"
                  bind:this={fieldContainer}
                  class="w-full h-full p-2 flex items-center justify-center"
                ></div>
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
  #strategy-sheet-preview-field {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

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
