<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type { Point, Line, SequenceItem, Shape, Settings } from "../../types";
  import { copy } from "svelte-copy";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
  import json from "svelte-highlight/languages/json";
  import plaintext from "svelte-highlight/languages/plaintext";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath } from "../../stores";
  import {
    generateJavaCode,
    generatePointsArray,
    generateSequentialCommandCode,
    downloadTrajectory,
  } from "../../utils";
  import { tick, onMount } from "svelte";
  import { loadSettings, saveSettings } from "../../utils/settingsPersistence";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let shapes: Shape[] = [];
  export const settings: Settings | undefined = undefined;

  let exportFullCode = false;
  let exportFormat: "java" | "points" | "sequential" | "json" = "java";
  let sequentialClassName = "AutoPath";
  let targetLibrary: "SolversLib" | "NextFTC" = "SolversLib";
  const DEFAULT_PACKAGE =
    "org.firstinspires.ftc.teamcode.Commands.AutoCommands";
  let packageName = DEFAULT_PACKAGE;

  let exportedCode = "";
  let currentLanguage: typeof java | typeof plaintext | typeof json = java;
  let copied = false;
  let dialogRef: HTMLDivElement;
  let scrollContainer: HTMLDivElement;

  // Search State
  let showSearch = false;
  let searchQuery = "";
  let searchMatches: number[] = []; // Array of line numbers (0-indexed)
  let currentMatchIndex = -1;
  let searchInputRef: HTMLInputElement;

  const electronAPI = (window as any).electronAPI;

  // Update sequential class name when file changes
  $: if ($currentFilePath) {
    const fileName = $currentFilePath.split(/[\\/]/).pop();
    if (fileName) {
      const baseName = fileName
        .replace(".pp", "")
        .replace(/[^a-zA-Z0-9]/g, "_");
      if (
        sequentialClassName === "AutoPath" ||
        sequentialClassName === baseName
      ) {
        sequentialClassName = baseName;
      }
    }
  }

  // Load settings on mount
  onMount(async () => {
    const settings = await loadSettings();
    if (settings.javaPackageName) {
      packageName = settings.javaPackageName;
    } else {
      packageName = DEFAULT_PACKAGE;
    }
  });

  async function handlePackageKeydown(event: KeyboardEvent) {
    if (event.key !== "Enter") return;

    if (!packageName.trim()) {
      packageName = DEFAULT_PACKAGE;
      await refreshCode();
      await savePackageName();
    }
  }

  // Save package name to settings
  async function savePackageName() {
    const settings = await loadSettings();
    settings.javaPackageName = packageName;
    await saveSettings(settings);
  }

  async function refreshCode() {
    try {
      if (exportFormat === "java") {
        exportedCode = await generateJavaCode(
          startPoint,
          lines,
          exportFullCode,
          sequence,
          packageName,
        );
        currentLanguage = java;
      } else if (exportFormat === "points") {
        exportedCode = generatePointsArray(startPoint, lines);
        currentLanguage = plaintext;
      } else if (exportFormat === "sequential") {
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
          targetLibrary,
          packageName,
        );
        currentLanguage = java;
      } else if (exportFormat === "json") {
        exportedCode = JSON.stringify(
          { startPoint, lines, shapes, sequence },
          null,
          2,
        );
        currentLanguage = json;
      }

      // Re-run search if active
      if (searchQuery) {
        performSearch();
      }
    } catch (error) {
      console.error("Refresh failed:", error);
      exportedCode =
        "// Error refreshing code. Please check the console for details.";
      currentLanguage = plaintext;
    }
  }

  export async function openWithFormat(
    format: "java" | "points" | "sequential" | "json",
  ) {
    exportFormat = format;
    copied = false;
    showSearch = false;
    searchQuery = "";
    searchMatches = [];
    currentMatchIndex = -1;

    // Initialize sequential class name if needed
    if (format === "sequential" && $currentFilePath) {
      const fileName = $currentFilePath.split(/[\\/]/).pop();
      if (fileName) {
        sequentialClassName = fileName
          .replace(".pp", "")
          .replace(/[^a-zA-Z0-9]/g, "_");
      }
    }

    await refreshCode();

    isOpen = true;
    await tick();
    if (dialogRef) {
      dialogRef.focus();
    }
  }

  function handleCopy() {
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  async function handleSaveFile() {
    // For project exports (.pp / json), use the dedicated Download as .pp button instead
    // of the generic Save to File action.
    if (exportFormat === "json") {
      return;
    }

    if (!electronAPI || !electronAPI.showSaveDialog || !electronAPI.writeFile) {
      // Fallback for web: use download attribute trick via Blob
      // But downloadTrajectory is specialized for JSON/PP usually, let's make a generic one.
      const blob = new Blob([exportedCode], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      let filename = "generated_code.txt";
      if (exportFormat === "java" || exportFormat === "sequential") {
        // Try to find class name or use default
        // Regex to find 'class ClassName'
        const match = exportedCode.match(/class\s+(\w+)/);
        if (match) filename = `${match[1]}.java`;
        else filename = "AutoPath.java";
      } else if (exportFormat === "points") {
        filename = "points.txt";
      } else if (exportFormat === "json") {
        filename = "trajectory.pp";
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      return;
    }

    try {
      let defaultName = "generated_code";
      let extensions = ["txt"];
      let nameFilter = "Text File";

      if (exportFormat === "java" || exportFormat === "sequential") {
        const match = exportedCode.match(/class\s+(\w+)/);
        defaultName = match ? `${match[1]}.java` : "AutoPath.java";
        extensions = ["java"];
        nameFilter = "Java File";
      } else if (exportFormat === "points") {
        defaultName = "points.txt";
        extensions = ["txt"];
        nameFilter = "Text File";
      } else if (exportFormat === "json") {
        defaultName = "trajectory.json"; // Or .pp if user wants raw project
        // But for generic save, maybe .json is better if it is just json.
        // The Download as .pp button is separate.
        extensions = ["json"];
        nameFilter = "JSON File";
      }

      const filePath = await electronAPI.showSaveDialog({
        title: "Save Generated Code",
        defaultPath: defaultName,
        filters: [{ name: nameFilter, extensions }],
      });

      if (filePath) {
        await electronAPI.writeFile(filePath, exportedCode);
      }
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
        if (typeof (el as any).scrollIntoView === "function") {
          (el as any).scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }

  // Count lines for display
  $: lineCount = exportedCode.split("\n").length;
</script>

<svelte:head>
  {@html codeStyle}
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- Backdrop -->
  <div
    transition:fade={{ duration: 200 }}
    class="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6"
    role="presentation"
    on:click|self={() => (isOpen = false)}
  >
    <!-- Dialog Panel -->
    <div
      bind:this={dialogRef}
      transition:fly={{ y: 20, duration: 300 }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-5xl flex flex-col h-[85vh] border border-neutral-200 dark:border-neutral-800 outline-none"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      tabindex="-1"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 shrink-0"
      >
        <div class="flex flex-col gap-0.5">
          <h2
            id="export-dialog-title"
            class="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            {#if exportFormat === "java"}Export Java Code
            {:else if exportFormat === "points"}Export Points
            {:else if exportFormat === "json"}Project Data
            {:else}Sequential Command{/if}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {#if exportFormat === "java"}
              Standard Java code for your path.
            {:else if exportFormat === "points"}
              Raw array of points for processing.
            {:else if exportFormat === "json"}
              Raw PP data for the project.
            {:else}
              Command-based sequence for {targetLibrary}.
            {/if}
          </p>
        </div>

        <div class="flex items-center gap-2">
          <!-- Search Toggle -->
          {#if !showSearch}
            <button
              on:click={() => {
                showSearch = true;
                tick().then(() => searchInputRef?.focus());
              }}
              class="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Search code"
              title="Search (Ctrl+F)"
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
                  d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
                />
              </svg>
            </button>
          {:else}
            <!-- Search Bar -->
            <div
              class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 rounded-lg p-1 animate-in slide-in-from-right duration-200"
            >
              <input
                bind:this={searchInputRef}
                type="text"
                placeholder="Find..."
                bind:value={searchQuery}
                on:input={performSearch}
                on:keydown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (e.shiftKey) {
                      prevMatch();
                    } else {
                      nextMatch();
                    }
                  }
                }}
                class="bg-transparent border-none text-sm px-2 py-1 w-32 focus:ring-0 focus:outline-none text-neutral-900 dark:text-white placeholder-neutral-500"
              />
              <span class="text-xs text-neutral-400 min-w-[3rem] text-center">
                {#if searchMatches.length > 0}
                  {currentMatchIndex + 1}/{searchMatches.length}
                {:else if searchQuery}
                  0/0
                {/if}
              </span>
              <button
                on:click={prevMatch}
                disabled={searchMatches.length === 0}
                class="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-600 dark:text-neutral-400 disabled:opacity-30"
                aria-label="Previous match"
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
                    d="m4.5 15.75 7.5-7.5 7.5 7.5"
                  />
                </svg>
              </button>
              <button
                on:click={nextMatch}
                disabled={searchMatches.length === 0}
                class="p-1 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded text-neutral-600 dark:text-neutral-400 disabled:opacity-30"
                aria-label="Next match"
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
                    d="m19.5 8.25-7.5 7.5-7.5-7.5"
                  />
                </svg>
              </button>
              <button
                on:click={() => {
                  showSearch = false;
                  searchQuery = "";
                  searchMatches = [];
                }}
                class="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-500 rounded text-neutral-500 transition-colors"
                aria-label="Close search"
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
                    d="M6 18 18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          {/if}

          <!-- Close Button -->
          <button
            on:click={() => (isOpen = false)}
            class="p-2 rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Close export dialog"
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

      <!-- Settings Toolbar -->
      {#if exportFormat === "sequential" || exportFormat === "java"}
        <div
          class="px-6 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-6 items-end shrink-0"
        >
          <!-- Package Name Input -->
          <div class="flex flex-col gap-1.5 grow max-w-xl">
            <label
              for="package-name-input"
              class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
            >
              Package Name
            </label>
            <input
              id="package-name-input"
              type="text"
              bind:value={packageName}
              on:keydown={handlePackageKeydown}
              on:change={savePackageName}
              on:input={refreshCode}
              class="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 w-full font-mono"
              placeholder="org.firstinspires.ftc.teamcode.Commands.AutoCommands"
            />
          </div>

          <!-- Sequential Controls -->
          {#if exportFormat === "sequential"}
            <!-- Target Library Selector -->
            <div class="flex flex-col gap-1.5">
              <span
                class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                Target Library
              </span>
              <div
                class="flex p-1 bg-neutral-200 dark:bg-neutral-900 rounded-lg self-start"
                role="tablist"
              >
                <button
                  role="tab"
                  aria-selected={targetLibrary === "SolversLib"}
                  class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 {targetLibrary ===
                  'SolversLib'
                    ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-300 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
                  on:click={() => {
                    targetLibrary = "SolversLib";
                    refreshCode();
                  }}
                >
                  SolversLib
                </button>
                <button
                  role="tab"
                  aria-selected={targetLibrary === "NextFTC"}
                  class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 {targetLibrary ===
                  'NextFTC'
                    ? 'bg-white dark:bg-neutral-700 text-purple-600 dark:text-purple-300 shadow-sm'
                    : 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200'}"
                  on:click={() => {
                    targetLibrary = "NextFTC";
                    refreshCode();
                  }}
                >
                  NextFTC
                </button>
              </div>
            </div>

            <!-- Class Name Input -->
            <div class="flex flex-col gap-1.5">
              <label
                for="class-name-input"
                class="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400"
              >
                Class Name
              </label>
              <input
                id="class-name-input"
                type="text"
                bind:value={sequentialClassName}
                on:input={refreshCode}
                class="px-3 py-1.5 text-sm rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-[150px]"
                placeholder="AutoPath"
              />
            </div>

            <!-- NextFTC Warning -->
            {#if targetLibrary === "NextFTC"}
              <div
                class="flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs rounded-lg border border-yellow-200 dark:border-yellow-800/50"
                role="alert"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  class="size-4 shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                >
                  <path
                    d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
                  ></path>
                  <line x1="12" y1="9" x2="12" y2="13"></line>
                  <line x1="12" y1="17" x2="12.01" y2="17"></line>
                </svg>
                <span>NextFTC output is <strong>experimental</strong>.</span>
              </div>
            {/if}
          {/if}

          <!-- Java Controls -->
          {#if exportFormat === "java"}
            <label
              class="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-200 cursor-pointer select-none"
              aria-label="Export full Java class with imports"
            >
              <div class="relative flex items-center">
                <input
                  type="checkbox"
                  bind:checked={exportFullCode}
                  on:change={refreshCode}
                  class="peer h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700 dark:ring-offset-neutral-800"
                />
              </div>
              <span>Generate Full Class</span>
            </label>
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
          <!-- We render invisible text that matches layout, but with highlighted backgrounds -->
          <div
            class="absolute top-4 left-4 right-4 bottom-20 pointer-events-none select-none font-mono text-sm leading-relaxed"
            aria-hidden="true"
            style="transform: translateY(1.0em);"
          >
            {#each exportedCode.split("\n") as line, i}
              <!-- Data attribute used for scrolling to this line -->
              <div
                data-line-index={i}
                class="w-full {searchMatches.includes(i)
                  ? 'bg-yellow-500/30'
                  : 'bg-transparent'}"
                style="height: 1.625em;"
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
      <div
        class="flex items-center justify-between px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 rounded-b-xl shrink-0"
      >
        <div class="text-xs text-neutral-500 font-mono">
          {lineCount} lines generated
        </div>
        <div class="flex gap-3">
          <button
            class="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
            on:click={() => (isOpen = false)}
          >
            Close
          </button>

          {#if exportFormat !== "json"}
            <button
              class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
              on:click={handleSaveFile}
              title="Save the generated content to a file"
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
                  d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M12 12.75l-3-3m3 3 3-3m-3 3V3"
                />
              </svg>
              Save to File
            </button>
          {/if}

          {#if exportFormat === "json"}
            <button
              class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-neutral-700 dark:text-neutral-200 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-500"
              on:click={() => {
                const filePath = $currentFilePath;
                let filename = "trajectory";
                if (filePath) {
                  const baseName = filePath.split(/[\\/]/).pop() || "";
                  filename = baseName.replace(".pp", "");
                }
                downloadTrajectory(
                  startPoint,
                  lines,
                  shapes,
                  sequence,
                  `${filename}.pp`,
                );
              }}
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
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
              Download as .pp
            </button>
          {/if}
          <button
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg shadow-sm transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
            use:copy={exportedCode}
            on:svelte-copy={handleCopy}
            disabled={copied}
          >
            {#if copied}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2.5"
                stroke="currentColor"
                class="size-4 animate-in zoom-in duration-200"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="m4.5 12.75 6 6 9-13.5"
                />
              </svg>
              Copied!
            {:else}
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
                  d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184"
                />
              </svg>
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
