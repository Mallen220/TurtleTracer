<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    Shape,
    CommandLibraryId,
    CodeLanguage,
  } from "../../../types/index";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
  import kotlin from "svelte-highlight/languages/kotlin";
  import json from "svelte-highlight/languages/json";
  import plaintext from "svelte-highlight/languages/plaintext";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { fade, fly } from "svelte/transition";
  import {
    SearchIcon,
    ChevronUpIcon,
    ChevronDownIcon,
    CloseIcon,
    TriangleWarningIcon,
    DownloadIcon,
    SuccessIcon,
    ClipboardIcon,
  } from "../icons/index";
  import { currentFilePath, exportCycle, notification } from "../../../stores";
  import {
    otherAlliance,
    projectAlliance,
  } from "../../exporters/allianceMirroring";
  import { exporterRegistry } from "../../exporters";
  import {
    commandRegistrarMethod,
    commandRegistrarSummary,
  } from "../../exporters/eventMarkerUtils";
  import {
    COMMAND_LIBRARIES,
    getCommandLibrary,
  } from "../../exporters/commandLibraries";
  import { tick } from "svelte";
  import {
    findMatches,
    lineStartOffsets,
    lowerBound,
  } from "../../../utils/codeSearch";
  import { get } from "svelte/store";

  import { customExportersStore } from "../../pluginsStore";
  import {
    exportAsProjectFile,
    projectFileJson,
  } from "../../../utils/fileHandlers";
  import { triggerDownload } from "../../../utils/file";
  import type { BatchOutput } from "../../../utils/batchExport";
  import { getElectronAPI } from "../../../utils/platform";
  import { extraDataStore, settingsStore } from "../../projectStore";
  import ExportCycleActions from "./ExportCycleActions.svelte";
  import ExportFileLabel from "./ExportFileLabel.svelte";
  import { ui } from "../../ui";
  import { highlightPoints } from "../../../utils/htmlHighlighter";

  interface Props {
    isOpen?: boolean;
    startPoint: Point;
    lines: Line[];
    sequence: SequenceItem[];
    shapes?: Shape[];
  }

  let {
    isOpen = $bindable(false),
    startPoint = $bindable(),
    lines = $bindable(),
    sequence = $bindable(),
    shapes = $bindable([]),
  }: Props = $props();

  let exportFormat = $state<
    "java" | "points" | "sequential" | "json" | "custom"
  >("java");
  let customExporterName: string | null = $state(null);
  let sequentialClassName = $state("AutoPath");
  // The set-once options (package, registrar, units) stay folded away.
  let optionsOpen = $state(false);
  let selectedLibrary = $derived(
    getCommandLibrary($settingsStore.autoExportTargetLibrary),
  );
  // The OpMode and sequential exports can be written in either language.
  let hasLanguage = $derived(
    exportFormat === "java" || exportFormat === "sequential",
  );
  let registrarSummary = $derived(
    exportFormat === "java"
      ? commandRegistrarSummary(
          $settingsStore.commandRegistrar,
          $settingsStore.codeLanguage ?? "java",
        )
      : null,
  );
  // Whether this project's code mirrors, and the alliance it's drawn for.
  // It's saved in the project and set in the Field tab's TurtleTracerLib section.
  let projectSide = $derived(projectAlliance($extraDataStore));
  const allianceName = (a: string) =>
    a === "RED" ? "Red" : a === "BLUE" ? "Blue" : "None";
  /** What the dialog says about the project's alliance and mirroring. */
  let allianceStatus = $derived(
    projectSide.drawnFor === "NONE"
      ? "None, not mirrored"
      : `${allianceName(projectSide.drawnFor)}${
          projectSide.mirror
            ? `, mirrored to ${allianceName(otherAlliance(projectSide.drawnFor))}`
            : ", never mirrored"
        }`,
  );

  let writesKotlin = $derived(
    hasLanguage && $settingsStore.codeLanguage === "kotlin",
  );
  const LANGUAGES: { id: CodeLanguage; label: string }[] = [
    { id: "java", label: "Java" },
    { id: "kotlin", label: "Kotlin" },
  ];
  // Tab colours, written out in full so Tailwind can see the class names.
  // Adding a library to CommandLibraryId makes TypeScript ask for its colours.
  const LIBRARY_COLORS: Record<
    CommandLibraryId,
    { active: string; ring: string }
  > = {
    SolversLib: {
      active: "text-blue-600 dark:text-blue-300",
      ring: "focus-visible:ring-blue-500",
    },
    NextFTC: {
      active: "text-emerald-600 dark:text-emerald-300",
      ring: "focus-visible:ring-emerald-500",
    },
    Ivy: {
      active: "text-emerald-600 dark:text-emerald-300",
      ring: "focus-visible:ring-emerald-500",
    },
  };
  // The Find box's previous/next buttons sit on a grey strip, so they get a
  // filled background of their own, and dim (but stay readable) when disabled.
  const findStepBtn =
    "inline-flex items-center justify-center rounded-md p-1 min-h-6 min-w-6 transition-colors bg-neutral-300 text-neutral-900 hover:bg-neutral-400 dark:bg-neutral-600 dark:text-neutral-50 dark:hover:bg-neutral-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600 dark:focus-visible:ring-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-neutral-300 dark:disabled:hover:bg-neutral-600";
  const DEFAULT_PACKAGE =
    "org.firstinspires.ftc.teamcode.Commands.AutoCommands";

  let exportedCode = $state("");
  let currentLanguage:
    | typeof java
    | typeof kotlin
    | typeof plaintext
    | typeof json = $state(java);
  let copied = $state(false);
  let dialogRef: HTMLDivElement | undefined = $state();
  let scrollContainer: HTMLDivElement | undefined = $state();

  // Search State
  let showSearch = $state(false);
  let searchQuery = $state("");
  let searchMatches: number[] = $state.raw([]); // where each match starts in exportedCode
  let matchesCapped = $state(false);
  let currentMatchIndex = $state(-1);
  let searchInputRef: HTMLInputElement | undefined = $state();

  // Highlights are drawn from the real position of the rendered text, so they
  // can't drift off the right line. Only matches near the visible area are
  // drawn (a search for "a" can match thousands), the rest are just counted.
  interface HighlightBox {
    x: number;
    y: number;
    w: number;
    h: number;
    current: boolean;
  }
  interface LineStripe {
    y: number;
    h: number;
    current: boolean;
  }
  const MAX_DRAWN_MATCHES = 300;
  const LINES_DRAWN_OFFSCREEN = 20;
  let highlightBoxes: HighlightBox[] = $state.raw([]);
  let lineStripes: LineStripe[] = $state.raw([]);
  let overlayWidth = $state(0);
  let drawFrame = 0;

  /** The rendered code's text nodes, in order, with where each one starts. */
  interface TextMap {
    codeEl: Element;
    code: string;
    nodes: Text[];
    starts: number[];
    lineStarts: number[];
    ok: boolean;
  }
  let textMap: TextMap | null = null;

  /** A Java class name based on the project's file name. */
  function classNameFor(filePath: string): string {
    return (filePath.split(/[\\/]/).pop() ?? "")
      .replaceAll(/\.(pp|turt)$/gi, "")
      .replaceAll(/[^a-zA-Z0-9]/g, "_");
  }

  // Follow the open project's file name, unless the user has typed their own
  // class name. (Following only while the name was still the default left the
  // previous project's name in place after switching projects.)
  let classNameTyped = false;
  $effect(() => {
    if (classNameTyped || !$currentFilePath) return;
    const baseName = classNameFor($currentFilePath);
    if (baseName) sequentialClassName = baseName;
  });

  async function handlePackageKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;

    if (
      !$settingsStore.javaPackageName ||
      !$settingsStore.javaPackageName.trim()
    ) {
      $settingsStore.javaPackageName = DEFAULT_PACKAGE;
      await refreshCode();
    }
  }

  async function generate(): Promise<[string, typeof currentLanguage]> {
    if (exportFormat === "json") {
      return [await projectFileJson($currentFilePath ?? undefined), json];
    }

    const data = {
      startPoint,
      lines,
      shapes,
      sequence,
      extraData: $extraDataStore,
    };
    const exporter = get(exporterRegistry)[exportFormat];
    if (exporter) {
      const code = await exporter.exportCode(data, {
        ...$settingsStore,
        fileName: sequentialClassName,
        exportFullCode: $settingsStore.autoExportFullClass ?? true,
        packageName: $settingsStore.javaPackageName || DEFAULT_PACKAGE,
        telemetryImpl: $settingsStore.telemetryImplementation || "Panels",
        hardcodeValues: $settingsStore.autoExportEmbedPoseData || false,
        targetLibrary: $settingsStore.autoExportTargetLibrary || "SolversLib",
      });
      const isJava = exportFormat === "java" || exportFormat === "sequential";
      return [code, writesKotlin ? kotlin : isJava ? java : plaintext];
    }

    if (exportFormat !== "custom" || !customExporterName) {
      return ["Exporter not found.", plaintext];
    }
    const plugin = get(customExportersStore).find(
      (e) => e.name === customExporterName,
    );
    if (!plugin) return ["Exporter not found.", plaintext];
    try {
      return [await plugin.handler(data), plaintext];
    } catch (e) {
      return [`Error in plugin: ${e}`, plaintext];
    }
  }

  async function refreshCode() {
    try {
      [exportedCode, currentLanguage] = await generate();
    } catch (error) {
      console.error("Refresh failed:", error);
      exportedCode =
        "// Error refreshing code. Please check the console for details.";
      currentLanguage = plaintext;
    }
    if (searchQuery) performSearch(true);
  }

  export async function openWithFormat(
    format: "java" | "points" | "sequential" | "json" | "custom",
    exporterName?: string,
  ) {
    exportFormat = format;
    if (format === "custom" && exporterName) {
      customExporterName = exporterName;
    }
    copied = false;
    closeSearch();

    // Every format names its class after the project, so start from it each
    // time the dialog opens.
    classNameTyped = false;
    if ($currentFilePath) {
      sequentialClassName =
        classNameFor($currentFilePath) || sequentialClassName;
    }

    await refreshCode();

    isOpen = true;
    await tick();
    if (dialogRef) {
      dialogRef.focus();
    }
  }

  function markCopied() {
    copied = true;
    notification.set({ message: "Code copied to clipboard!", type: "success" });
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(exportedCode);
      markCopied();
    } catch (error) {
      console.error("Failed to copy code:", error);
      notification.set({ message: "Failed to copy code.", type: "error" });
    }
  }

  /** The file name the generated code is saved under, or for a batch a suffix to follow the project's name. */
  function outputName(batch = false): Pick<BatchOutput, "name" | "suffix"> {
    if (exportFormat === "json") return { suffix: ".turt" };
    const isJava = exportFormat === "java" || exportFormat === "sequential";
    if (isJava) {
      const className = /class\s+(\w+)/.exec(exportedCode)?.[1] ?? "AutoPath";
      return { name: `${className}.${writesKotlin ? "kt" : "java"}` };
    }
    const file =
      exportFormat === "points" ? "points.txt" : "generated_code.txt";
    return batch ? { suffix: `_${file}` } : { name: file };
  }

  /** For Run as Batch: the code for the file that is open now, with its own class name. */
  export async function exportForBatch(): Promise<BatchOutput> {
    classNameTyped = false;
    if ($currentFilePath) {
      sequentialClassName =
        classNameFor($currentFilePath) || sequentialClassName;
    }
    await tick(); // the bound project data catches up with the swapped-in file
    await refreshCode();
    return { ...outputName(true), data: exportedCode };
  }

  /** Returns whether the file was written or downloaded. */
  async function handleSaveFile(): Promise<boolean> {
    // Project data has its own "Download as .turt" button.
    if (exportFormat === "json") return false;

    const isJava = exportFormat === "java" || exportFormat === "sequential";
    const fileName = outputName().name!;

    const electronAPI = getElectronAPI();
    if (
      !electronAPI ||
      electronAPI.isVirtual ||
      !electronAPI.showSaveDialog ||
      !electronAPI.writeFile
    ) {
      triggerDownload(exportedCode, "text/plain", fileName);
      return true;
    }

    try {
      const filePath = await electronAPI.showSaveDialog({
        title: "Save Generated Code",
        defaultPath: fileName,
        filters: writesKotlin
          ? [{ name: "Kotlin File", extensions: ["kt"] }]
          : isJava
            ? [{ name: "Java File", extensions: ["java"] }]
            : [{ name: "Text File", extensions: ["txt"] }],
      });
      if (!filePath) return false;
      await electronAPI.writeFile(filePath, exportedCode);
      return true;
    } catch (err) {
      console.error("Failed to save file:", err);
      alert("Failed to save file: " + (err as Error).message);
      return false;
    }
  }

  /** Exporting several files: save this one, then on to the next. */
  async function saveAndContinue() {
    const saved =
      exportFormat === "json"
        ? await exportAsProjectFile()
        : await handleSaveFile();
    if (saved) isOpen = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (showSearch) {
        closeSearch();
        dialogRef?.focus();
      } else {
        isOpen = false;
      }
    }
    // Ctrl+F or Cmd+F opens search, or refocuses it and selects what's there
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && isOpen) {
      e.preventDefault();
      focusSearch();
    }
  }

  function focusSearch() {
    showSearch = true;
    tick().then(() => {
      searchInputRef?.focus();
      searchInputRef?.select();
    });
  }

  function closeSearch() {
    showSearch = false;
    searchQuery = "";
    searchMatches = [];
    matchesCapped = false;
    currentMatchIndex = -1;
    highlightBoxes = [];
    lineStripes = [];
  }

  /**
   * Finds every match. When the code was regenerated underneath an open
   * search, `keepPosition` stays on the same match number if it still exists.
   */
  function performSearch(keepPosition = false) {
    const previous = keepPosition ? currentMatchIndex : -1;
    const result = findMatches(exportedCode, searchQuery);
    searchMatches = result.offsets;
    matchesCapped = result.capped;
    if (result.offsets.length === 0) {
      currentMatchIndex = -1;
      return;
    }
    currentMatchIndex =
      previous >= 0 && previous < result.offsets.length ? previous : 0;
    if (!keepPosition) revealCurrentMatch();
  }

  function nextMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    revealCurrentMatch();
  }

  function prevMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    revealCurrentMatch();
  }

  /** Maps the rendered text back to offsets in the code string. */
  function getTextMap(): TextMap | null {
    const codeEl = scrollContainer?.querySelector("code");
    if (!codeEl) return null;
    if (
      textMap &&
      textMap.codeEl === codeEl &&
      textMap.code === exportedCode &&
      (textMap.nodes.length === 0 || textMap.nodes.at(-1)?.isConnected)
    ) {
      return textMap.ok ? textMap : null;
    }
    const nodes: Text[] = [];
    const starts: number[] = [];
    let length = 0;
    const walker = document.createTreeWalker(codeEl, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      nodes.push(n as Text);
      starts.push(length);
      length += (n as Text).data.length;
    }
    textMap = {
      codeEl,
      code: exportedCode,
      nodes,
      starts,
      lineStarts: lineStartOffsets(exportedCode),
      // If the page text isn't the code (it should be), skip highlighting
      // rather than draw in the wrong place.
      ok: length === exportedCode.length,
    };
    return textMap.ok ? textMap : null;
  }

  /** The text node holding `offset`, and the offset within it. */
  function locate(map: TextMap, offset: number, preferEnd: boolean) {
    let index = lowerBound(map.starts, offset + 1) - 1;
    if (index < 0) index = 0;
    if (preferEnd && offset === map.starts[index] && index > 0) index -= 1;
    return { node: map.nodes[index], at: offset - map.starts[index] };
  }

  /** On-screen rectangles of one match. */
  function matchRects(map: TextMap, matchIndex: number): DOMRect[] {
    const start = searchMatches[matchIndex];
    const end = start + searchQuery.length;
    if (map.nodes.length === 0 || end > map.code.length) return [];
    const range = document.createRange();
    try {
      const from = locate(map, start, false);
      const to = locate(map, end, true);
      range.setStart(from.node, from.at);
      range.setEnd(to.node, to.at);
    } catch {
      return [];
    }
    // jsdom has no layout, so there's nothing to measure there
    if (typeof range.getClientRects !== "function") return [];
    return [...range.getClientRects()].filter((r) => r.width > 0);
  }

  function lineHeightOf(el: Element): number {
    const style = getComputedStyle(el);
    const height = Number.parseFloat(style.lineHeight);
    if (Number.isFinite(height) && height > 0) return height;
    return (Number.parseFloat(style.fontSize) || 14) * 1.625;
  }

  function scheduleDraw() {
    if (drawFrame || typeof requestAnimationFrame !== "function") return;
    drawFrame = requestAnimationFrame(drawHighlights);
  }

  function drawHighlights() {
    drawFrame = 0;
    const container = scrollContainer;
    const map = showSearch && searchMatches.length > 0 ? getTextMap() : null;
    if (!container || !map) {
      if (highlightBoxes.length > 0) highlightBoxes = [];
      if (lineStripes.length > 0) lineStripes = [];
      return;
    }

    const lineHeight = lineHeightOf(map.codeEl);
    const box = container.getBoundingClientRect();
    // Used only to decide which matches are worth measuring. Where they are
    // drawn always comes from the measured text.
    const codeTop =
      map.codeEl.getBoundingClientRect().top - box.top + container.scrollTop;
    const firstLine = Math.max(
      0,
      Math.floor((container.scrollTop - codeTop) / lineHeight) -
        LINES_DRAWN_OFFSCREEN,
    );
    const lastLine =
      Math.ceil(
        (container.scrollTop + container.clientHeight - codeTop) / lineHeight,
      ) + LINES_DRAWN_OFFSCREEN;
    const from = lowerBound(
      searchMatches,
      map.lineStarts[Math.min(firstLine, map.lineStarts.length - 1)],
    );
    const to =
      lastLine + 1 >= map.lineStarts.length
        ? searchMatches.length
        : lowerBound(searchMatches, map.lineStarts[lastLine + 1]);

    const indices: number[] = [];
    for (let i = from; i < to && indices.length < MAX_DRAWN_MATCHES; i++) {
      indices.push(i);
    }
    if (currentMatchIndex >= 0 && !indices.includes(currentMatchIndex)) {
      indices.push(currentMatchIndex);
    }

    const boxes: HighlightBox[] = [];
    const stripes = new Map<number, LineStripe>();
    for (const i of indices) {
      const current = i === currentMatchIndex;
      for (const r of matchRects(map, i)) {
        const y = r.top - box.top + container.scrollTop;
        boxes.push({
          x: r.left - box.left + container.scrollLeft,
          y,
          w: r.width,
          h: r.height,
          current,
        });
        const stripeY = Math.round(y + r.height / 2 - lineHeight / 2);
        const existing = stripes.get(stripeY);
        if (existing) {
          existing.current ||= current;
        } else {
          stripes.set(stripeY, { y: stripeY, h: lineHeight, current });
        }
      }
    }
    highlightBoxes = boxes;
    lineStripes = [...stripes.values()];
    overlayWidth = container.scrollWidth;
  }

  /** Scrolls so the current match is on screen, centred vertically. */
  async function revealCurrentMatch() {
    await tick();
    const container = scrollContainer;
    const map = getTextMap();
    if (!container || !map || currentMatchIndex < 0) return;
    const rect = matchRects(map, currentMatchIndex)[0];
    if (!rect || typeof container.scrollTo !== "function") return;

    const box = container.getBoundingClientRect();
    const top = rect.top - box.top + container.scrollTop;
    const left = rect.left - box.left + container.scrollLeft;
    const margin = 24;
    const offLeft = left < container.scrollLeft + margin;
    const offRight =
      left + rect.width > container.scrollLeft + container.clientWidth - margin;
    container.scrollTo({
      top: Math.max(0, top - container.clientHeight / 2 + rect.height / 2),
      left:
        offLeft || offRight
          ? Math.max(0, left - container.clientWidth / 3)
          : container.scrollLeft,
      behavior: "smooth",
    });
  }

  // Redraw when anything the highlights depend on changes
  $effect(() => {
    void exportedCode;
    void currentLanguage;
    void searchMatches;
    void currentMatchIndex;
    void showSearch;
    tick().then(scheduleDraw);
  });

  // ...or when the dialog is resized
  $effect(() => {
    if (!scrollContainer || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(scheduleDraw);
    observer.observe(scrollContainer);
    return () => observer.disconnect();
  });

  $effect(() => () => {
    if (drawFrame && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(drawFrame);
    }
  });

  // Count lines for display
  let lineCount = $derived(exportedCode.split("\n").length);
</script>

<svelte:head>
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html codeStyle}
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    transition:fade={{ duration: 200 }}
    class="{ui.overlay} z-[1000]"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget) isOpen = false;
    }}
  >
    <!-- Dialog Panel -->
    <div
      bind:this={dialogRef}
      transition:fly={{ y: 20, duration: 300 }}
      class="{ui.dialog} w-full max-w-5xl flex flex-col h-[85vh] outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      tabindex="-1"
    >
      <!-- Header -->
      <div class="{ui.dialogHeader} shrink-0">
        <div class="flex flex-col gap-0.5">
          <h2
            id="export-dialog-title"
            class="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
          >
            {#if exportFormat === "java"}Export {writesKotlin
                ? "Kotlin"
                : "Java"} Code
            {:else if exportFormat === "points"}Export Points
            {:else if exportFormat === "json"}Project Data
            {:else if exportFormat === "custom"}{customExporterName ||
                "Plugin Output"}
            {:else}Sequential Command{/if}
            <ExportFileLabel />
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {#if exportFormat === "java"}
              A Pedro Pathing OpMode for your path. No command library needed.
            {:else if exportFormat === "points"}
              Raw array of points for processing.
            {:else if exportFormat === "json"}
              Raw Turt data for the project.
            {:else if exportFormat === "custom"}
              Output generated by plugin.
            {:else}
              {selectedLibrary.description}
            {/if}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Search Toggle -->
          {#if !showSearch}
            <button
              onclick={focusSearch}
              class={ui.iconBtn.neutral}
              aria-label="Search code"
              title="Search (Ctrl+F)"
            >
              <SearchIcon strokeWidth={2} className="size-5" />
            </button>
          {:else}
            <!-- Search Bar -->
            <div
              class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-md p-1 animate-in slide-in-from-right duration-200"
            >
              <input
                bind:this={searchInputRef}
                type="text"
                placeholder="Find..."
                bind:value={searchQuery}
                oninput={() => performSearch()}
                onkeydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                      prevMatch();
                    } else {
                      nextMatch();
                    }
                  }
                }}
                class="bg-transparent border-none text-sm px-2 py-1 w-32 focus:ring-0 focus:outline-none text-neutral-900 dark:text-neutral-100 placeholder-neutral-500"
              />
              <span
                class="text-xs text-neutral-500 dark:text-neutral-400 min-w-[3rem] text-center"
              >
                {#if searchMatches.length > 0}
                  {currentMatchIndex + 1}/{searchMatches.length}{matchesCapped
                    ? "+"
                    : ""}
                {:else if searchQuery}
                  0/0
                {/if}
              </span>
              <button
                title="Previous match (Shift+Enter)"
                onclick={prevMatch}
                disabled={searchMatches.length === 0}
                class={findStepBtn}
                aria-label="Previous match"
              >
                <ChevronUpIcon strokeWidth={2} className="size-4" />
              </button>
              <button
                title="Next match (Enter)"
                onclick={nextMatch}
                disabled={searchMatches.length === 0}
                class={findStepBtn}
                aria-label="Next match"
              >
                <ChevronDownIcon strokeWidth={2} className="size-4" />
              </button>
              <button
                onclick={closeSearch}
                class={ui.iconBtnSm.danger}
                aria-label="Close search"
              >
                <CloseIcon strokeWidth={2} className="size-4" />
              </button>
            </div>
          {/if}

          <!-- Close Button -->
          <button
            onclick={() => (isOpen = false)}
            class={ui.iconBtn.neutral}
            aria-label="Close export dialog"
            title={$exportCycle ? "Skip this file" : "Close"}
          >
            <CloseIcon strokeWidth={2} className="size-5" />
          </button>
        </div>
      </div>

      <!-- Settings Toolbar: what changes per export stays on one row, the
           rest (set once per team) folds away under Options. -->
      {#if exportFormat === "sequential" || exportFormat === "java"}
        {@const metricNeedsPoses =
          $settingsStore.codeUnits === "metric" &&
          !$settingsStore.autoExportEmbedPoseData &&
          exportFormat === "sequential"}
        {@const optionsShown = optionsOpen || metricNeedsPoses}
        <div class="{ui.bar} px-6 py-3 flex flex-col gap-3 shrink-0">
          <div class="flex flex-wrap items-end gap-x-6 gap-y-3">
            {#if hasLanguage}
              <!-- Language Selector -->
              <div class="flex flex-col gap-1.5">
                <span class={ui.heading}> Language </span>
                <div
                  class="flex p-1 bg-neutral-200 dark:bg-neutral-900 rounded-md self-start"
                  role="tablist"
                >
                  {#each LANGUAGES as language (language.id)}
                    {@const selected =
                      ($settingsStore.codeLanguage ?? "java") === language.id}
                    <button
                      role="tab"
                      aria-selected={selected}
                      class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 {selected
                        ? 'bg-white dark:bg-neutral-700 shadow-sm text-purple-600 dark:text-purple-300'
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
                      onclick={() => {
                        $settingsStore.codeLanguage = language.id;
                        refreshCode();
                      }}
                    >
                      {language.label}
                    </button>
                  {/each}
                </div>
              </div>
            {/if}

            {#if exportFormat === "sequential"}
              <!-- Target Library Selector -->
              <div class="flex flex-col gap-1.5">
                <span class={ui.heading}> Target Library </span>
                <div
                  class="flex p-1 bg-neutral-200 dark:bg-neutral-900 rounded-md self-start"
                  role="tablist"
                >
                  {#each COMMAND_LIBRARIES as library (library.id)}
                    {@const accent = LIBRARY_COLORS[library.id]}
                    {@const selected = selectedLibrary.id === library.id}
                    <button
                      role="tab"
                      aria-selected={selected}
                      class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-2 {accent.ring} {selected
                        ? `bg-white dark:bg-neutral-700 shadow-sm ${accent.active}`
                        : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
                      onclick={() => {
                        $settingsStore.autoExportTargetLibrary = library.id;
                        refreshCode();
                      }}
                    >
                      {library.label}
                    </button>
                  {/each}
                </div>
              </div>

              <!-- Class Name Input -->
              <div class="flex flex-col gap-1.5">
                <label for="class-name-input" class={ui.heading}>
                  Class Name
                </label>
                <input
                  id="class-name-input"
                  type="text"
                  bind:value={sequentialClassName}
                  oninput={() => {
                    classNameTyped = true;
                    refreshCode();
                  }}
                  class="{ui.inputSm} min-w-[150px]"
                  placeholder="AutoPath"
                />
              </div>
            {/if}

            <!-- Set in the Field tab; shown here so the code below makes sense. -->
            <div class="flex flex-col gap-1.5" data-testid="mirroring-status">
              <span class={ui.heading}> Alliance </span>
              <span
                class="text-sm text-neutral-700 dark:text-neutral-300 py-1.5"
                title="Set per project in the Field tab, under Alliance Selection & Path Mirroring."
              >
                {allianceStatus}
                <span class="text-xs text-neutral-500 dark:text-neutral-400"
                  >(Field tab)</span
                >
              </span>
            </div>

            <!-- Options disclosure -->
            <div class="ml-auto flex items-center">
              <button
                type="button"
                onclick={() => (optionsOpen = !optionsOpen)}
                class="{ui.btnSm.ghost} shrink-0"
                title="{optionsShown ? 'Hide' : 'Show'} export options"
                aria-expanded={optionsShown}
                aria-controls="export-options"
              >
                <ChevronDownIcon
                  className="size-3 transition-transform duration-200 {optionsShown
                    ? 'rotate-0'
                    : '-rotate-90'}"
                  strokeWidth={2.5}
                />
                <span class={ui.heading}>Options</span>
              </button>
            </div>
          </div>

          {#if optionsShown}
            <div
              id="export-options"
              class="grid gap-x-6 gap-y-5 sm:grid-cols-2"
              transition:fade={{ duration: 150 }}
            >
              <!-- Package Name Input -->
              <div class="flex flex-col gap-1.5">
                <label for="package-name-input" class={ui.heading}>
                  Package Name
                </label>
                <input
                  id="package-name-input"
                  type="text"
                  bind:value={$settingsStore.javaPackageName}
                  onkeydown={handlePackageKeydown}
                  oninput={refreshCode}
                  class="{ui.inputSm} w-full font-mono"
                  placeholder={DEFAULT_PACKAGE}
                />
              </div>

              {#if exportFormat === "java"}
                <!-- Command Registrar Input -->
                <div class="relative flex flex-col gap-1.5">
                  <label for="command-registrar-input" class={ui.heading}>
                    Command Registrar (optional)
                  </label>
                  <input
                    id="command-registrar-input"
                    type="text"
                    bind:value={$settingsStore.commandRegistrar}
                    oninput={refreshCode}
                    class="{ui.inputSm} w-full font-mono"
                    placeholder="org.firstinspires.ftc.teamcode.RobotCommands.register"
                    title="A method of yours that registers your named commands. The code calls it with hardwareMap when the path uses event markers."
                  />
                  <!-- One line in the row gap, so showing it moves nothing. -->
                  {#if $settingsStore.commandRegistrar?.trim() && !commandRegistrarMethod($settingsStore.commandRegistrar)}
                    <p
                      class="absolute left-0 right-0 top-full truncate pt-1 text-xs leading-4 text-red-600 dark:text-red-400"
                    >
                      Use a class and method, like RobotCommands.register
                    </p>
                  {:else if registrarSummary}
                    <p
                      class="absolute left-0 right-0 top-full truncate pt-1 text-xs leading-4 text-neutral-600 dark:text-neutral-400"
                      data-testid="registrar-summary"
                      title="{registrarSummary.call} is written with its full class name, so it needs no import."
                    >
                      Adds <code class="font-mono"
                        >{registrarSummary.short}</code
                      >
                      to {registrarSummary.where} when the path has event markers.
                    </p>
                  {/if}
                </div>
              {/if}

              <!-- Code Units -->
              <div class="flex flex-col gap-1.5">
                <span class={ui.heading}> Code Units </span>
                <div class="flex gap-4" role="radiogroup">
                  <label class={ui.checkLabel}>
                    <input
                      type="radio"
                      name="codeUnits"
                      value="imperial"
                      bind:group={$settingsStore.codeUnits}
                      onchange={refreshCode}
                      class={ui.checkbox}
                    />
                    <span>Imperial (Inches)</span>
                  </label>
                  <label class={ui.checkLabel}>
                    <input
                      type="radio"
                      name="codeUnits"
                      value="metric"
                      bind:group={$settingsStore.codeUnits}
                      onchange={refreshCode}
                      class={ui.checkbox}
                    />
                    <span>Metric (cm)</span>
                  </label>
                </div>
              </div>

              <!-- Checkboxes -->
              <div class="flex flex-col gap-2 sm:justify-end">
                {#if exportFormat === "java"}
                  <label
                    class={ui.checkLabel}
                    aria-label="Export full Java class with imports"
                  >
                    <div class="relative flex items-center">
                      <input
                        type="checkbox"
                        bind:checked={$settingsStore.autoExportFullClass}
                        onchange={refreshCode}
                        class="{ui.checkbox} peer"
                      />
                    </div>
                    <span>Generate Full Class</span>
                  </label>
                {:else}
                  <label
                    class={ui.checkLabel}
                    aria-label="Embed pose data directly in the code"
                  >
                    <div class="relative flex items-center">
                      <input
                        type="checkbox"
                        bind:checked={$settingsStore.autoExportEmbedPoseData}
                        onchange={refreshCode}
                        class="{ui.checkbox} peer"
                      />
                    </div>
                    <span>Embed Pose Data in Code</span>
                  </label>
                {/if}
              </div>
            </div>
          {/if}

          {#if (writesKotlin && exportedCode.includes("has no Kotlin export yet")) || (exportFormat === "sequential" && selectedLibrary.experimental) || metricNeedsPoses}
            <div class="flex flex-wrap gap-3">
              {#if writesKotlin && exportedCode.includes("has no Kotlin export yet")}
                <div
                  class="{ui.alert.warning} flex items-center gap-2"
                  role="alert"
                >
                  <TriangleWarningIcon className="size-4 shrink-0" />
                  <span
                    >Some steps come from plugins that can't write Kotlin yet;
                    they're left as TODO comments.</span
                  >
                </div>
              {/if}
              {#if exportFormat === "sequential" && selectedLibrary.experimental}
                <div
                  class="{ui.alert.warning} flex items-center gap-2"
                  role="alert"
                >
                  <TriangleWarningIcon className="size-4 shrink-0" />
                  <span
                    >{selectedLibrary.label} output is
                    <strong>experimental</strong>.</span
                  >
                </div>
              {/if}
              {#if metricNeedsPoses}
                <div
                  class="{ui.alert.warning} flex items-center gap-2"
                  role="alert"
                >
                  <TriangleWarningIcon className="size-4 shrink-0" />
                  <span
                    >Metric code generation requires embedding poses. Please
                    enable 'Embed Pose Data'.</span
                  >
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

      <!-- Code Content -->
      <div class="relative flex-1 min-h-0 bg-[#282b2e] overflow-hidden group">
        <div
          bind:this={scrollContainer}
          onscroll={scheduleDraw}
          class="absolute inset-0 overflow-auto custom-scrollbar p-4 pb-20"
        >
          <!-- Highlight layer for search results: drawn behind the code at the
               measured position of each match -->
          <div
            class="absolute left-0 top-0 h-0 pointer-events-none select-none"
            style="width: {overlayWidth}px;"
            aria-hidden="true"
          >
            {#each lineStripes as stripe (stripe.y)}
              <div
                class="absolute left-0 right-0 {stripe.current
                  ? 'bg-yellow-400/25'
                  : 'bg-yellow-400/10'}"
                style="top: {stripe.y}px; height: {stripe.h}px;"
              ></div>
            {/each}
            {#each highlightBoxes as match}
              <div
                class="absolute rounded-sm {match.current
                  ? 'bg-orange-500/60 outline outline-2 outline-orange-300'
                  : 'bg-yellow-400/40'}"
                style="left: {match.x}px; top: {match.y}px; width: {match.w}px; height: {match.h}px;"
              ></div>
            {/each}
          </div>

          <!-- Actual Code Layer -->
          {#if exportFormat === "points"}
            <!-- Points get a color per pose, which hljs can't do. Same markup Highlight renders. -->
            <!-- highlightPoints escapes the code before wrapping it. -->
            <!-- eslint-disable svelte/no-at-html-tags -->
            <pre
              class="highlight-wrapper text-sm font-mono leading-relaxed relative z-10"><code
                class="hljs"
                >{@html highlightPoints(exportedCode).join("\n")}</code
              ></pre>
            <!-- eslint-enable svelte/no-at-html-tags -->
          {:else}
            <Highlight
              language={currentLanguage}
              code={exportedCode}
              class="highlight-wrapper text-sm font-mono leading-relaxed relative z-10"
            />
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-between rounded-b-xl shrink-0">
        <div class="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
          {lineCount} lines generated
        </div>
        <div class="flex gap-3">
          {#if $exportCycle}
            <ExportCycleActions
              exporter={exportForBatch}
              onclose={() => (isOpen = false)}
              onaction={saveAndContinue}
              >{exportFormat === "json"
                ? "Download as .turt"
                : "Save to File"}</ExportCycleActions
            >
          {:else}
            <button class={ui.btn.ghost} onclick={() => (isOpen = false)}>
              Close
            </button>

            {#if exportFormat !== "json"}
              <button
                class={ui.btn.secondary}
                onclick={handleSaveFile}
                title="Save the generated content to a file"
                aria-label="Save the generated content to a file"
              >
                <DownloadIcon className="size-4" />
                Save to File
              </button>
            {/if}

            {#if exportFormat === "json"}
              <button class={ui.btn.secondary} onclick={exportAsProjectFile}>
                <DownloadIcon className="size-4" />
                Download as .turt
              </button>
            {/if}
            <button
              class={ui.btn.primary}
              onclick={handleCopy}
              disabled={copied}
            >
              {#if copied}
                <SuccessIcon
                  className="size-4 animate-in zoom-in duration-200"
                />
                Copied!
              {:else}
                <ClipboardIcon className="size-4" />
                Copy Code
              {/if}
            </button>
          {/if}
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* Ensure the highlightjs background is transparent so our line highlights show through */
  :global(.highlight-wrapper) {
    background: transparent !important;
    padding: 0 !important; /* Remove padding from hljs container */
    margin: 0 !important; /* Remove margin */
    overflow: visible !important; /* Prevent double scrollbars */
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace !important;
    font-size: 0.875rem !important; /* text-sm */
    line-height: 1.625 !important; /* leading-relaxed */
  }

  /* Ensure inner pre/code elements also match (some highlight styles add padding on the pre element) */
  :global(.highlight-wrapper pre),
  :global(.highlight-wrapper pre.hljs) {
    padding: 0 !important;
    margin: 0 !important;
    line-height: 1.625 !important;
    overflow: visible !important;
  }

  :global(.highlight-wrapper code) {
    /* The theme paints its own background on the code element, which hid the
       search highlights drawn behind it. */
    background: transparent !important;
    overflow: visible !important;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace !important;
  }
</style>
