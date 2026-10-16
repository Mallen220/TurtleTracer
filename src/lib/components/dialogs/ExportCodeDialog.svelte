<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    Shape,
    CommandLibraryId,
  } from "../../../types/index";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
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
  import { currentFilePath, notification } from "../../../stores";
  import { exporterRegistry } from "../../exporters";
  import {
    COMMAND_LIBRARIES,
    getCommandLibrary,
  } from "../../exporters/commandLibraries";
  import { tick } from "svelte";
  import { get } from "svelte/store";

  import {
    exportAsProjectFile,
    projectFileJson,
  } from "../../../utils/fileHandlers";
  import { triggerDownload } from "../../../utils/file";
  import { getElectronAPI } from "../../../utils/platform";
  import { settingsStore } from "../../projectStore";
  import { ui } from "../../ui";

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

  /** "json" for the project file, else an exporter's id. */
  let exportFormat: string = $state("java");
  /** The exporter for the format; plugins' exporters have an owner. */
  let exporter = $derived($exporterRegistry[exportFormat]);
  let isJava = $derived(
    exportFormat === "java" || exportFormat === "sequential",
  );
  let sequentialClassName = $state("AutoPath");
  let selectedLibrary = $derived(
    getCommandLibrary($settingsStore.autoExportTargetLibrary),
  );
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
  const DEFAULT_PACKAGE =
    "org.firstinspires.ftc.teamcode.Commands.AutoCommands";

  let exportedCode = $state("");
  let currentLanguage: typeof java | typeof plaintext | typeof json =
    $state(java);
  let copied = $state(false);
  let dialogRef: HTMLDivElement | undefined = $state();
  let scrollContainer: HTMLDivElement | undefined = $state();

  // Search State
  let showSearch = $state(false);
  let searchQuery = $state("");
  let searchMatches: number[] = $state([]); // Array of line numbers (0-indexed)
  let currentMatchIndex = $state(-1);
  let searchInputRef: HTMLInputElement | undefined = $state();

  /** A Java class name based on the project's file name. */
  function classNameFor(filePath: string): string {
    return (filePath.split(/[\\/]/).pop() ?? "")
      .replaceAll(/\.(pp|turt)$/gi, "")
      .replaceAll(/[^a-zA-Z0-9]/g, "_");
  }

  // Follow the file name, unless the user has typed their own class name.
  $effect(() => {
    if (!$currentFilePath) return;
    const baseName = classNameFor($currentFilePath);
    if (
      baseName &&
      (sequentialClassName === "AutoPath" || sequentialClassName === baseName)
    ) {
      sequentialClassName = baseName;
    }
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

    const data = { startPoint, lines, shapes, sequence };
    const exporter = get(exporterRegistry)[exportFormat];
    if (!exporter) return ["Exporter not found.", plaintext];
    try {
      const code = await exporter.exportCode(data, {
        ...$settingsStore,
        fileName: sequentialClassName,
        exportFullCode: $settingsStore.autoExportFullClass ?? true,
        packageName: $settingsStore.javaPackageName || DEFAULT_PACKAGE,
        telemetryImpl: $settingsStore.telemetryImplementation || "Panels",
        hardcodeValues: $settingsStore.autoExportEmbedPoseData || false,
        targetLibrary: $settingsStore.autoExportTargetLibrary || "SolversLib",
      });
      const language = exporter.language ?? (isJava ? "java" : "plaintext");
      return [code, { java, json, plaintext }[language]];
    } catch (e) {
      if (!exporter.owner) throw e;
      return [`Error in plugin: ${(e as Error).message ?? e}`, plaintext];
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
    if (searchQuery) performSearch();
  }

  export async function openWithFormat(format: string) {
    exportFormat = format;
    copied = false;
    showSearch = false;
    searchQuery = "";
    searchMatches = [];
    currentMatchIndex = -1;

    if (format === "sequential" && $currentFilePath) {
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

  async function handleSaveFile() {
    // Project data has its own "Download as .turt" button.
    if (exportFormat === "json") return;

    const extension = exporter?.extension ?? "txt";
    let fileName = `generated_code.${extension}`;
    if (isJava) {
      const className = /class\s+(\w+)/.exec(exportedCode)?.[1] ?? "AutoPath";
      fileName = `${className}.java`;
    } else if (exportFormat === "points") {
      fileName = "points.txt";
    }

    const electronAPI = getElectronAPI();
    if (
      !electronAPI ||
      electronAPI.isVirtual ||
      !electronAPI.showSaveDialog ||
      !electronAPI.writeFile
    ) {
      triggerDownload(exportedCode, "text/plain", fileName);
      return;
    }

    try {
      const filePath = await electronAPI.showSaveDialog({
        title: "Save Generated Code",
        defaultPath: fileName,
        filters: isJava
          ? [{ name: "Java File", extensions: ["java"] }]
          : [
              {
                name:
                  extension === "txt"
                    ? "Text File"
                    : `${extension.toUpperCase()} File`,
                extensions: [extension],
              },
            ],
      });
      if (filePath) await electronAPI.writeFile(filePath, exportedCode);
    } catch (err) {
      console.error("Failed to save file:", err);
      alert("Failed to save file: " + (err as Error).message);
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      if (showSearch) {
        showSearch = false;
        searchQuery = "";
        searchMatches = [];
        dialogRef?.focus();
      } else {
        isOpen = false;
      }
    }
    // Ctrl+F or Cmd+F to toggle search
    if ((e.ctrlKey || e.metaKey) && e.key === "f" && isOpen) {
      e.preventDefault();
      showSearch = true;
      tick().then(() => searchInputRef?.focus());
    }
  }

  function performSearch() {
    if (!searchQuery) {
      searchMatches = [];
      currentMatchIndex = -1;
      return;
    }

    const lines = exportedCode.split("\n");
    const matches: number[] = [];
    const query = searchQuery.toLowerCase();

    lines.forEach((line, index) => {
      if (line.toLowerCase().includes(query)) {
        matches.push(index);
      }
    });

    searchMatches = matches;
    if (matches.length > 0) {
      currentMatchIndex = 0;
      scrollToMatch(matches[0]);
    } else {
      currentMatchIndex = -1;
    }
  }

  function nextMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex = (currentMatchIndex + 1) % searchMatches.length;
    scrollToMatch(searchMatches[currentMatchIndex]);
  }

  function prevMatch() {
    if (searchMatches.length === 0) return;
    currentMatchIndex =
      (currentMatchIndex - 1 + searchMatches.length) % searchMatches.length;
    scrollToMatch(searchMatches[currentMatchIndex]);
  }

  function scrollToMatch(lineIndex: number) {
    if (scrollContainer) {
      const el = scrollContainer.querySelector(
        `[data-line-index="${lineIndex}"]`,
      );
      if (el) {
        // Only call scrollIntoView if supported (jsdom in tests doesn't implement it)
        if (typeof el.scrollIntoView === "function") {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }

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
            {#if exportFormat === "java"}Export Java Code
            {:else if exportFormat === "points"}Export Points
            {:else if exportFormat === "json"}Project Data
            {:else if exporter?.owner}{exporter.name}
            {:else}Sequential Command{/if}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {#if exportFormat === "java"}
              Standard Java code for your path.
            {:else if exportFormat === "points"}
              Raw array of points for processing.
            {:else if exportFormat === "json"}
              Raw Turt data for the project.
            {:else if exporter?.owner}
              {exporter.description}
            {:else}
              {selectedLibrary.description}
            {/if}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Search Toggle -->
          {#if !showSearch}
            <button
              onclick={() => {
                showSearch = true;
                tick().then(() => searchInputRef?.focus());
              }}
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
                oninput={performSearch}
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
                  {currentMatchIndex + 1}/{searchMatches.length}
                {:else if searchQuery}
                  0/0
                {/if}
              </span>
              <button
                title="Previous match"
                onclick={prevMatch}
                disabled={searchMatches.length === 0}
                class={ui.iconBtnSm.neutral}
                aria-label="Previous match"
              >
                <ChevronUpIcon strokeWidth={2} className="size-4" />
              </button>
              <button
                title="Next match"
                onclick={nextMatch}
                disabled={searchMatches.length === 0}
                class={ui.iconBtnSm.neutral}
                aria-label="Next match"
              >
                <ChevronDownIcon strokeWidth={2} className="size-4" />
              </button>
              <button
                onclick={() => {
                  showSearch = false;
                  searchQuery = "";
                  searchMatches = [];
                }}
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
          >
            <CloseIcon strokeWidth={2} className="size-5" />
          </button>
        </div>
      </div>

      <!-- Settings Toolbar -->
      {#if exportFormat === "sequential" || exportFormat === "java"}
        <div class="{ui.bar} px-6 py-3 flex flex-wrap gap-6 items-end shrink-0">
          <!-- Package Name Input -->
          <div class="flex flex-col gap-1.5 grow max-w-xl">
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
              placeholder="org.firstinspires.ftc.teamcode.Commands.AutoCommands"
            />
          </div>

          <!-- Sequential Controls -->
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
                oninput={refreshCode}
                class="{ui.inputSm} min-w-[150px]"
                placeholder="AutoPath"
              />
            </div>

            <!-- Embed Pose Data -->
            <div class="flex flex-col gap-1.5">
              <span class="{ui.heading} opacity-0"> Embed Poses </span>
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
            </div>

            <!-- Experimental Library Warning -->
            {#if selectedLibrary.experimental}
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
            {#if $settingsStore.codeUnits === "metric" && !$settingsStore.autoExportEmbedPoseData && exportFormat === "sequential"}
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
          {/if}

          <!-- Java Controls -->
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
          {/if}

          {#if exportFormat === "java" || exportFormat === "sequential" || exportFormat === "points"}
            <div class="flex flex-col gap-1.5 mt-2">
              <span class={ui.heading}> Code Units </span>
              <div class="flex gap-2" role="radiogroup">
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
          {/if}
        </div>
      {/if}

      <!-- Code Content -->
      <div class="relative flex-1 min-h-0 bg-[#282b2e] overflow-hidden group">
        <div
          bind:this={scrollContainer}
          class="absolute inset-0 overflow-auto custom-scrollbar p-4 pb-20"
        >
          <!-- Highlight Layer for Search Results -->
          <!-- render invisible text that matches layout, but with highlighted backgrounds -->
          <div
            class="absolute top-4 left-4 right-4 bottom-20 pointer-events-none select-none font-mono text-sm leading-relaxed"
            aria-hidden="true"
            style="transform: translateY(1.0em);"
          >
            {#each searchMatches as matchIndex (matchIndex)}
              <!-- Data attribute used for scrolling to this line -->
              <div
                data-line-index={matchIndex}
                class="absolute left-0 right-0 bg-yellow-500/30"
                style="top: calc({matchIndex} * 1.625em); height: 1.625em;"
              ></div>
            {/each}
          </div>

          <!-- Actual Code Layer -->
          <Highlight
            language={currentLanguage}
            code={exportedCode}
            class="highlight-wrapper text-sm font-mono leading-relaxed relative z-10"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="{ui.dialogFooter} justify-between rounded-b-xl shrink-0">
        <div class="text-xs text-neutral-500 dark:text-neutral-400 font-mono">
          {lineCount} lines generated
        </div>
        <div class="flex gap-3">
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
          <button class={ui.btn.primary} onclick={handleCopy} disabled={copied}>
            {#if copied}
              <SuccessIcon className="size-4 animate-in zoom-in duration-200" />
              Copied!
            {:else}
              <ClipboardIcon className="size-4" />
              Copy Code
            {/if}
          </button>
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
    overflow: visible !important;
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace !important;
  }
</style>
