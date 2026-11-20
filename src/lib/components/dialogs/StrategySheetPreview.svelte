<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { tick } from "svelte";
  import type {
    Point,
    Line,
    SequenceItem,
    Settings,
    StrategySheetOptions,
  } from "../../../types";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath, exportCycle } from "../../../stores";
  import { formatTime } from "../../../utils";
  import { DEFAULT_FIELD_MAP, DEFAULT_STRATEGY_SHEET } from "../../../config";
  import {
    formatDisplayDistance,
    formatDisplayCoordinate,
  } from "../../../utils/coordinates";
  import { extraDataStore } from "../../projectStore";
  import {
    CloseIcon,
    DocumentIcon,
    ArrowDownTrayIcon,
    SidebarLeftIcon,
    SidebarHiddenIcon,
  } from "../icons";
  import ExportCycleActions from "./ExportCycleActions.svelte";
  import ExportFileLabel from "./ExportFileLabel.svelte";
  import OptionsPanel from "./StrategySheetOptions.svelte";
  import { ui } from "../../ui";
  import type { BatchOutput } from "../../../utils/batchExport";
  import { decorateField } from "../../../utils/strategySheetField";
  import { makeId } from "../../../utils/nameGenerator";

  interface Props {
    isOpen?: boolean;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    settings: Settings;
    timePrediction: any; // Type is loose because TimePrediction might be complex
    twoInstance?: any; // Two.js instance
  }

  let {
    isOpen = $bindable(false),
    startPoint,
    lines,
    sequence,
    settings = $bindable(),
    timePrediction,
    twoInstance = null,
  }: Props = $props();

  let fieldContainer: HTMLDivElement | undefined = $state();
  let dialogRef: HTMLDivElement | undefined = $state();
  let sheetRef: HTMLDivElement | undefined = $state();
  let fitRef: HTMLDivElement | undefined = $state();
  let showOptions = $state(globalThis.innerWidth >= 1000);
  /** True while the PDF is drawn: edit controls and empty blocks stay off the page. */
  let exporting = $state(false);
  let fitScale = $state(1);

  // The options are global (in Settings); the dialog is rebuilt for each file of a batch.
  const opts: StrategySheetOptions = $derived({
    ...DEFAULT_STRATEGY_SHEET,
    ...settings.strategySheet,
  });
  function setOpt<K extends keyof StrategySheetOptions>(
    key: K,
    value: StrategySheetOptions[K],
  ) {
    settings = { ...settings, strategySheet: { ...opts, [key]: value } };
  }

  const PAGES = { letter: [215.9, 279.4], a4: [210, 297] } as const;
  const page = $derived.by(() => {
    const [w, h] = PAGES[opts.pageSize] ?? PAGES.letter;
    return opts.landscape ? { w: h, h: w } : { w, h };
  });

  // Per project: the notes blocks.
  const SEED_BLOCKS = ["Setup", "Scored", "Tolerances"];
  type Block = { id: string; label: string; text: string };
  // A file that never had blocks shows the seed; it is saved once the user edits.
  const blocks: Block[] = $derived(
    $extraDataStore.strategyBlocks ??
      SEED_BLOCKS.map((label) => ({ id: label, label, text: "" })),
  );
  const setExtra = (key: string, value: unknown) =>
    extraDataStore.set({ ...$extraDataStore, [key]: value });
  const setBlocks = (next: Block[]) => setExtra("strategyBlocks", next);
  const editBlock = (id: string, patch: Partial<Block>) =>
    setBlocks(blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)));

  /** Grows a textarea to its text, so a printed or PDF page shows all of it. */
  function autosize(node: HTMLTextAreaElement, _text: string) {
    const fit = () => {
      node.style.height = "auto";
      node.style.height = node.scrollHeight + "px";
    };
    fit();
    return { update: fit };
  }

  function renderField() {
    if (!fieldContainer || !twoInstance) return;

    // Clear previous content
    fieldContainer.innerHTML = "";

    // Clone the SVG (or canvas) from the main renderer
    const originalEl = twoInstance.renderer?.domElement;

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
          : `/fields/${DEFAULT_FIELD_MAP}`;
    }

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
            bwidth = Number.parseFloat(originalWidth) || 800;
            bheight = Number.parseFloat(originalHeight) || 800;
          }
        }

        const imgEl = svg.ownerDocument.createElementNS(
          "http://www.w3.org/2000/svg",
          "image",
        );
        // Try both namespaced and non-namespaced href for compatibility
        try {
          imgEl.setAttributeNS("http://www.w3.org/1999/xlink", "href", bgSrc);
        } catch {
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

    try {
      const serializer = new XMLSerializer();
      // The original has no background image: an SVG used as an image can't load one.
      const sourceSvg =
        originalEl.tagName && originalEl.tagName.toUpperCase() === "SVG"
          ? originalEl
          : svg;
      const drawn = sourceSvg.cloneNode(true) as Element;
      decorateField(drawn, sourceSvg, pathNumbers, opts.inkSaver);
      const svgString = serializer.serializeToString(drawn);

      // Ensure background image is present and fills container
      if (bgSrc) {
        const bgImg = document.createElement("img");
        bgImg.src = bgSrc;
        bgImg.alt = "Field";
        bgImg.style.opacity = opts.inkSaver ? "0.35" : "1";
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

  $effect(() => {
    if (isOpen) tick().then(() => dialogRef?.focus());
  });

  // Draws the field again when what it shows changes.
  $effect(() => {
    if (!isOpen) return;
    void [opts.numberPaths, opts.inkSaver, opts.showField, rows];
    tick().then(renderField);
  });

  // Fit to one page: the sheet is laid out 1/scale times wider and scaled down by
  // `scale`, so text reflows as it shrinks. The field is sized in mm, so it shrinks too.
  // (A transform, not CSS zoom: the PDF renderer ignores zoom.)
  $effect(() => {
    void [page, opts, rows, blocks, $extraDataStore.strategyNotes];
    if (!isOpen) return;
    const fit = opts.fitOnePage;
    tick().then(async () => {
      if (!fitRef) return;
      fitScale = 1;
      if (!fit) return;
      // The page less the sheet's 10mm margin on each side.
      const room = (page.h - 20) * (96 / 25.4);
      // Wider text is shorter, so a pass can grow the scale; stop once it fits and settles.
      for (let pass = 0; pass < 6; pass++) {
        await tick();
        const next = Math.min(1, room / fitRef.scrollHeight);
        if (next < fitScale + 0.005 && fitRef.scrollHeight * fitScale <= room)
          return;
        fitScale = next;
      }
      // Never leave it clipped: a smaller scale only makes the layout shorter.
      await tick();
      fitScale = Math.min(fitScale, room / fitRef.scrollHeight);
    });
  });

  function handlePrint() {
    // Print on the chosen paper; the sheet sets its own margin.
    const style = document.createElement("style");
    style.textContent = `@page{size:${opts.pageSize} ${opts.landscape ? "landscape" : "portrait"};margin:10mm}`;
    document.head.append(style);
    addEventListener("afterprint", () => style.remove(), { once: true });
    globalThis.print();
  }

  /** The printable sheet as a PDF. */
  async function sheetPdf(): Promise<Blob | null> {
    if (!sheetRef) return null;
    // Dynamic import to avoid bundling issues
    const html2pdf = (await import("html2pdf.js")).default;
    exporting = true;
    await tick();
    try {
      return await (html2pdf()
        .set(pdfOptions)
        .from(sheetRef)
        .outputPdf("blob") as Promise<Blob>);
    } finally {
      exporting = false;
    }
  }

  const pdfOptions = $derived({
    margin: 0,
    filename: "strategy-sheet.pdf",
    image: { type: "png", quality: 0.98 },
    html2canvas: { scale: 2 },
    jsPDF: {
      format: opts.pageSize,
      orientation: opts.landscape ? "landscape" : "portrait",
    },
    // Rows stay whole when the sheet runs onto another page.
    pagebreak: { mode: ["css", "legacy"], avoid: "tr" },
  }) as any;

  async function handleDownloadPdf() {
    if (!sheetRef) return;
    const html2pdf = (await import("html2pdf.js")).default;
    exporting = true;
    await tick();
    try {
      await html2pdf()
        .set({ ...pdfOptions, filename: `${projectName}-strategy-sheet.pdf` })
        .from(sheetRef)
        .save();
    } finally {
      exporting = false;
    }
    if ($exportCycle) handleClose();
  }

  /** For Run as Batch: the sheet of the file that is open now, with that file's own notes. */
  export async function exportForBatch(): Promise<BatchOutput> {
    await tick(); // the sheet's content follows the swapped-in file
    renderField();
    await tick();
    const blob = await sheetPdf();
    if (!blob) throw new Error("The strategy sheet isn't showing");
    return { suffix: "-strategy-sheet.pdf", data: blob };
  }

  function handleClose() {
    isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      handleClose();
    }
  }

  const degrees = (n: number) => `${+n.toFixed(1)}°`;
  /** How a path or the start sets the robot's heading, in words. */
  function headingText(p: Point | undefined): string {
    if (!p) return "";
    const reverse = p.reverse ? " (reversed)" : "";
    switch (p.heading) {
      case "constant":
        return (p.degrees == null ? "Prev" : degrees(p.degrees)) + reverse;
      case "linear":
        return `${p.startDeg == null ? "Prev" : degrees(p.startDeg)} → ${degrees(p.endDeg)}${reverse}`;
      case "tangential":
        return "Tangential" + reverse;
      case "facingPoint":
        return `Facing (${p.targetX.toFixed(0)}, ${p.targetY.toFixed(0)})`;
      case "piecewise":
        return "Piecewise";
    }
    return "";
  }

  type Row = {
    type: "path" | "wait" | "macro" | "rotate";
    name: string;
    details: string;
    heading: string;
    events: string[];
    lineId?: string;
    /** How long the step takes and when it ends, in seconds; macros have none. */
    time?: { duration: number; end: number };
  };

  // Combine Path, Waits, and Rotations into a linear list for the table
  const rows: Row[] = $derived.by(() => {
    const timeline: any[] = timePrediction?.timeline ?? [];
    const timed = (match: (e: any) => boolean) => {
      const e = timeline.find(match);
      return e && { duration: e.duration, end: e.endTime };
    };
    const markers = (list: { name: string; position: number }[] = []) =>
      list.map((e) => `${e.name} @ ${(e.position * 100).toFixed(0)}%`);
    const items: Row[] = [];

    for (const seqItem of sequence) {
      if (seqItem.kind === "path") {
        const line = lines.find((l) => l.id === seqItem.lineId);
        if (!line) continue;
        items.push({
          type: "path",
          name: line.name || `Path ${lines.indexOf(line) + 1}`,
          details: `-> (${line.endPoint.x.toFixed(1)}, ${line.endPoint.y.toFixed(1)})`,
          heading: headingText(line.endPoint),
          events: markers(line.eventMarkers),
          lineId: line.id,
          time: timed(
            (e) =>
              e.type === "travel" &&
              (e.line?.id === line.id || e.lineIndex === lines.indexOf(line)),
          ),
        });
      } else if (seqItem.kind === "wait") {
        items.push({
          type: "wait",
          name: seqItem.name || "Wait",
          details: `${seqItem.durationMs}ms`,
          heading: "",
          events: [],
          time: timed((e) => e.waitId === seqItem.id),
        });
      } else if (seqItem.kind === "rotate") {
        items.push({
          type: "rotate",
          name: seqItem.name || "Rotate",
          details: `${seqItem.degrees}°`,
          heading: "",
          events: markers(seqItem.eventMarkers),
          time: timed((e) => e.waitId === seqItem.id),
        });
      } else if (seqItem.kind === "macro") {
        items.push({
          type: "macro",
          name: seqItem.name,
          details: "Macro",
          heading: "",
          events: [],
        });
      }
    }

    return opts.hideWaitsAndMacros
      ? items.filter((r) => r.type === "path" || r.type === "rotate")
      : items;
  });

  /** The field's number for the end of each path: its row in the table. */
  const pathNumbers = $derived(
    opts.numberPaths
      ? rows.flatMap((row, i) =>
          row.lineId
            ? [
                {
                  id: `point-${lines.findIndex((l) => l.id === row.lineId) + 1}-0`,
                  n: i + 1,
                },
              ]
            : [],
        )
      : [],
  );

  const seconds = (n: number) => `${n.toFixed(1)} s`;

  let projectName = $derived(
    $currentFilePath
      ? $currentFilePath
          .split(/[\\/]/)
          .pop()
          ?.replaceAll(/\.(pp|turt)$/gi, "")
      : "Untitled Project",
  );
</script>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop (Hidden on Print) -->
  <div
    transition:fade={{ duration: 200 }}
    class="{ui.overlay} z-[1000] print:hidden"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) handleClose();
    }}
  >
    <!-- Dialog Panel -->
    <div
      bind:this={dialogRef}
      transition:fly={{ y: 20, duration: 300 }}
      class="{ui.dialog} w-full max-w-6xl h-[90vh] flex flex-col outline-none overflow-hidden"
      role="dialog"
      aria-modal="true"
      aria-labelledby="strategy-sheet-title"
      tabindex="-1"
    >
      <!-- Header (Screen Only) -->
      <div class="{ui.dialogHeader} shrink-0">
        <h2
          id="strategy-sheet-title"
          class="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
        >
          Strategy Sheet Preview
          <ExportFileLabel />
        </h2>
        <div class="flex items-center gap-2">
          {#if !$exportCycle}
            <button onclick={handlePrint} class={ui.btn.secondary}>
              <DocumentIcon className="size-4" />
              Print
            </button>
            <button onclick={handleDownloadPdf} class={ui.btn.primary}>
              <ArrowDownTrayIcon className="size-4" />
              Download PDF
            </button>
          {/if}
          <button
            title={$exportCycle ? "Skip this file" : "Close"}
            onclick={handleClose}
            aria-label="Close"
            class={ui.iconBtn.neutral}
          >
            <CloseIcon className="size-5" />
          </button>
        </div>
      </div>

      <div class="flex flex-1 min-h-0">
        <!-- The options rail folds to its button, like the control tab. -->
        <div
          class="{showOptions
            ? 'w-72'
            : 'w-12'} shrink-0 flex flex-col border-r border-neutral-200 dark:border-neutral-700 print:hidden"
        >
          <div class="flex items-center justify-between gap-2 p-2 shrink-0">
            {#if showOptions}
              <span
                class="px-2 text-sm font-semibold text-neutral-700 dark:text-neutral-200"
                >Options</span
              >
            {/if}
            <button
              title={showOptions ? "Hide options" : "Show options"}
              aria-label={showOptions ? "Hide options" : "Show options"}
              aria-expanded={showOptions}
              onclick={() => (showOptions = !showOptions)}
              class={ui.iconBtn.neutral}
            >
              {#if showOptions}
                <SidebarLeftIcon className="size-5" />
              {:else}
                <SidebarHiddenIcon className="size-5" />
              {/if}
            </button>
          </div>
          {#if showOptions}
            <div class="flex-1 overflow-auto">
              <OptionsPanel {opts} onchange={setOpt} />
            </div>
          {/if}
        </div>

        <!-- Preview Content (Scrollable) -->
        <div
          class="flex-1 overflow-auto bg-neutral-100 dark:bg-neutral-900 p-8 print:overflow-visible print:p-0 print:bg-white"
        >
          <!-- Printable Sheet -->
          <div
            bind:this={sheetRef}
            style="--sheet-w:{page.w}mm;--sheet-h:{page.h}mm;--content-w:{page.w -
              20}mm"
            class="bg-white text-black w-[var(--sheet-w)] mx-auto shadow-xl p-[10mm] flex flex-col {opts.fitOnePage
              ? 'h-[var(--sheet-h)] overflow-hidden'
              : 'min-h-[var(--sheet-h)]'} print:shadow-none print:p-0 print:w-full print:max-w-none print:min-h-0 print:h-auto print:overflow-visible"
          >
            <div
              bind:this={fitRef}
              style:transform={fitScale < 1 ? `scale(${fitScale})` : undefined}
              style:transform-origin="top left"
              style:width="{100 / fitScale}%"
              class="flex flex-col gap-6 flex-1"
            >
              <!-- Sheet Header -->
              <div
                class="flex items-start justify-between gap-4 border-b-2 border-black pb-4"
              >
                <div class="flex items-center gap-4 min-w-0">
                  {#if opts.logo}
                    <img
                      src={opts.logo}
                      alt="Team logo"
                      class="h-16 w-auto object-contain shrink-0"
                    />
                  {/if}
                  <div class="min-w-0">
                    {#if opts.teamName}
                      <div
                        class="text-sm font-semibold uppercase tracking-wide text-gray-600"
                      >
                        {opts.teamName}
                      </div>
                    {/if}
                    <h1 class="text-3xl font-bold uppercase tracking-tight">
                      {projectName}
                    </h1>
                    {#if opts.showDate}
                      <div class="text-sm text-gray-600 mt-1">
                        Generated {new Date().toLocaleDateString()}
                      </div>
                    {/if}
                  </div>
                </div>
                <div class="text-right shrink-0">
                  <div class="text-xl font-bold">
                    {formatTime(timePrediction?.totalTime ?? 0)}
                  </div>
                  <div class="text-sm text-gray-600">Estimated Duration</div>
                </div>
              </div>

              <!-- Top Section: Field and Stats -->
              {#if opts.showField || opts.showStats || opts.showRobot}
                {@const hasInfo = opts.showStats || opts.showRobot}
                <!-- A big field leaves the stats below it. Sizes are in mm so fit-to-page can scale them. -->
                {@const beside =
                  opts.showField && hasInfo && opts.fieldSize <= 70}
                <div
                  class={beside ? "grid gap-6" : "flex flex-col gap-6"}
                  style:grid-template-columns={beside
                    ? `calc(var(--content-w) * ${opts.fieldSize / 100}) 1fr`
                    : undefined}
                >
                  {#if opts.showField}
                    <div
                      class="aspect-square border border-gray-300 rounded overflow-hidden relative bg-white mx-auto"
                      style:width="calc(var(--content-w) * {opts.fieldSize /
                        100})"
                    >
                      <!-- Field SVG Container -->
                      <div
                        id="strategy-sheet-preview-field"
                        bind:this={fieldContainer}
                        class="w-full h-full p-2 flex items-center justify-center"
                      ></div>
                    </div>
                  {/if}

                  <!-- Stats & Robot Info -->
                  {#if hasInfo}
                    <div
                      class="{beside
                        ? 'flex flex-col'
                        : 'grid grid-cols-2'} gap-4"
                    >
                      {#if opts.showStats}
                        <div
                          class="border border-gray-300 rounded p-4 {opts.showRobot
                            ? ''
                            : 'col-span-2'}"
                        >
                          <h3
                            class="font-bold border-b border-gray-200 pb-2 mb-2"
                          >
                            Statistics
                          </h3>
                          <div class="grid grid-cols-2 gap-y-2 text-sm">
                            <div class="text-gray-600">Total Time:</div>
                            <div class="font-medium">
                              {formatTime(timePrediction?.totalTime ?? 0)}
                            </div>
                            <div class="text-gray-600">Total Distance:</div>
                            <div class="font-medium">
                              {formatDisplayDistance(
                                timePrediction?.totalDistance ?? 0,
                                settings,
                                1,
                              )}
                            </div>
                            <div class="text-gray-600">Path Segments:</div>
                            <div class="font-medium">{lines.length}</div>
                          </div>
                        </div>
                      {/if}

                      {#if opts.showRobot}
                        <div
                          class="border border-gray-300 rounded p-4 {beside
                            ? 'flex-1'
                            : ''} {opts.showStats ? '' : 'col-span-2'}"
                        >
                          <h3
                            class="font-bold border-b border-gray-200 pb-2 mb-2"
                          >
                            Robot Profile
                          </h3>
                          <div class="grid grid-cols-2 gap-y-2 text-sm">
                            <div class="text-gray-600">Width:</div>
                            <div class="font-medium">{settings.rWidth}"</div>
                            <div class="text-gray-600">Length:</div>
                            <div class="font-medium">{settings.rLength}"</div>
                            <div class="text-gray-600">Max Vel:</div>
                            <div class="font-medium">
                              {settings.maxVelocity} in/s
                            </div>
                            <div class="text-gray-600">Max Accel:</div>
                            <div class="font-medium">
                              {settings.maxAcceleration} in/s²
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                </div>
              {/if}

              <!-- Path Table: a clean list; a step's details sit under its name. -->
              {#if opts.showSequence}
                <div>
                  <h3 class="font-bold text-lg mb-2">Path Sequence</h3>
                  <table class="w-full text-sm border-collapse">
                    <thead>
                      <tr
                        class="text-left text-[11px] uppercase tracking-wide text-gray-500 border-b-2 border-black"
                      >
                        <th class="py-1 pr-3 w-8 font-semibold">#</th>
                        <th class="py-1 pr-3 font-semibold">Step</th>
                        {#if opts.colHeading}
                          <th class="py-1 pr-3 font-semibold">Heading</th>
                        {/if}
                        {#if opts.colTime}
                          <th class="py-1 pr-3 font-semibold text-right"
                            >Time</th
                          >
                        {/if}
                        {#if opts.colEvents}
                          <th class="py-1 pl-4 font-semibold">Events</th>
                        {/if}
                      </tr>
                    </thead>
                    <tbody>
                      {#snippet badge(n: string)}
                        <span
                          class="inline-flex size-5 items-center justify-center rounded-full bg-black text-[11px] font-bold text-white"
                          >{n}</span
                        >
                      {/snippet}
                      <tr class="border-b border-gray-200 break-inside-avoid">
                        <td class="py-1.5 pr-3 align-top"
                          >{@render badge("S")}</td
                        >
                        <td class="py-1.5 pr-3 align-top">
                          <div class="font-semibold">Start</div>
                          {#if opts.colDetails}
                            <div class="text-xs text-gray-500">
                              ({formatDisplayCoordinate(
                                startPoint.x,
                                settings,
                              )}, {formatDisplayCoordinate(
                                startPoint.y,
                                settings,
                              )})
                            </div>
                          {/if}
                        </td>
                        {#if opts.colHeading}
                          <td class="py-1.5 pr-3 align-top"
                            >{headingText(startPoint)}</td
                          >
                        {/if}
                        {#if opts.colTime}
                          <td class="py-1.5 pr-3"></td>
                        {/if}
                        {#if opts.colEvents}
                          <td class="py-1.5"></td>
                        {/if}
                      </tr>
                      {#each rows as item, i}
                        <tr class="border-b border-gray-200 break-inside-avoid">
                          <td class="py-1.5 pr-3 align-top"
                            >{@render badge(String(i + 1))}</td
                          >
                          <td class="py-1.5 pr-3 align-top">
                            <div class="font-semibold">
                              {item.name}
                              {#if item.type !== "path"}
                                <span
                                  class="ml-1 text-[10px] font-medium uppercase text-gray-500"
                                  >{item.type}</span
                                >
                              {/if}
                            </div>
                            {#if opts.colDetails}
                              <div class="text-xs text-gray-500">
                                {item.details}
                              </div>
                            {/if}
                          </td>
                          {#if opts.colHeading}
                            <td class="py-1.5 pr-3 align-top">{item.heading}</td
                            >
                          {/if}
                          {#if opts.colTime}
                            <td
                              class="py-1.5 pr-3 align-top text-right tabular-nums whitespace-nowrap"
                            >
                              {#if item.time}
                                <div class="font-semibold">
                                  {seconds(item.time.duration)}
                                </div>
                                <div class="text-xs text-gray-500">
                                  ends {seconds(item.time.end)}
                                </div>
                              {:else}
                                —
                              {/if}
                            </td>
                          {/if}
                          {#if opts.colEvents}
                            <td class="py-1.5 pl-4 align-top">
                              {#each item.events as event}
                                <div class="text-xs">{event}</div>
                              {/each}
                            </td>
                          {/if}
                        </tr>
                      {/each}
                    </tbody>
                  </table>
                </div>
              {/if}

              <!-- Notes Section -->
              {#if opts.showNotes}
                <div class="flex-1 flex flex-col gap-3">
                  <h3 class="font-bold text-lg">Strategy Notes</h3>
                  <div class="grid grid-cols-2 gap-3">
                    {#each blocks as block (block.id)}
                      {#if !exporting || block.text.trim()}
                        <div
                          class="border border-gray-300 rounded p-2 break-inside-avoid {block.text.trim()
                            ? ''
                            : 'print:hidden'}"
                        >
                          <div
                            class="flex items-center gap-1 border-b border-gray-200 pb-1 mb-1"
                          >
                            <input
                              class="flex-1 min-w-0 bg-transparent font-bold text-sm focus:outline-none"
                              aria-label="Block name"
                              value={block.label}
                              oninput={(e) =>
                                editBlock(block.id, {
                                  label: e.currentTarget.value,
                                })}
                            />
                            {#if !exporting}
                              <button
                                class="print:hidden {ui.iconBtnSm.neutral}"
                                title="Remove this block"
                                aria-label="Remove {block.label}"
                                onclick={() =>
                                  setBlocks(
                                    blocks.filter((b) => b.id !== block.id),
                                  )}
                              >
                                <CloseIcon className="size-4" />
                              </button>
                            {/if}
                          </div>
                          <textarea
                            use:autosize={block.text}
                            class="w-full min-h-[2.5rem] bg-transparent border-none resize-none focus:outline-none text-sm leading-relaxed overflow-hidden"
                            aria-label={block.label || "Notes block"}
                            value={block.text}
                            oninput={(e) =>
                              editBlock(block.id, {
                                text: e.currentTarget.value,
                              })}
                          ></textarea>
                        </div>
                      {/if}
                    {/each}
                  </div>
                  {#if !exporting}
                    <button
                      class="print:hidden self-start {ui.btnSm.secondary}"
                      onclick={() =>
                        setBlocks([
                          ...blocks,
                          { id: makeId("block"), label: "New block", text: "" },
                        ])}
                    >
                      Add block
                    </button>
                  {/if}
                  <!--
                    Feature: Digital Strategy Notes
                    Why: Replaces the previous static printed lines with a digital text area,
                         allowing users to type out and persist their strategy notes directly in the app.
                    Impact: Eliminates manual writing post-print, ensures notes stay attached to the project file via extraDataStore.
                  -->
                  <div
                    class="border-t border-gray-300 flex-1 min-h-[150px] flex relative"
                  >
                    <textarea
                      use:autosize={$extraDataStore.strategyNotes ?? ""}
                      class="w-full flex-1 min-h-[150px] p-2 bg-transparent border-none resize-none focus:outline-none focus:ring-1 focus:ring-gray-300 print:overflow-visible overflow-hidden text-sm leading-relaxed"
                      placeholder="Type your strategy notes here..."
                      bind:value={$extraDataStore.strategyNotes}
                    ></textarea>
                    {#if !$extraDataStore.strategyNotes}
                      <!--
                        Fallback lines for printing if the user chooses not to type notes
                        but still wants to handwrite them later.
                      -->
                      <div
                        class="absolute inset-0 pointer-events-none z-[-1] print:block hidden flex-col"
                      >
                        {#each Array(6) as _, _i}
                          <div
                            class="border-b border-gray-300 h-10 w-full"
                          ></div>
                        {/each}
                      </div>
                    {/if}
                  </div>
                </div>
              {/if}
            </div>
          </div>
        </div>
      </div>

      {#if $exportCycle}
        <div class="{ui.dialogFooter} justify-end print:hidden">
          <ExportCycleActions
            exporter={exportForBatch}
            onclose={handleClose}
            onaction={handleDownloadPdf}
            combine={opts.combinePdf}
            oncombine={(v) => setOpt("combinePdf", v)}
            >Download PDF</ExportCycleActions
          >
        </div>
      {/if}
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
