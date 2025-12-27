<script lang="ts">
  import type { Point, Line, SequenceItem } from "../../types";
  import { copy } from "svelte-copy";
  import Highlight from "svelte-highlight";
  import { java } from "svelte-highlight/languages";
  import plaintext from "svelte-highlight/languages/plaintext";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";
  import { currentFilePath } from "../../stores";
  import {
    generateJavaCode,
    generatePointsArray,
    generateSequentialCommandCode,
  } from "../../utils";
  import { onMount, tick } from "svelte";

  export let isOpen = false;
  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];

  let exportFullCode = false;
  let exportFormat: "java" | "points" | "sequential" = "java";
  let sequentialClassName = "AutoPath";
  let targetLibrary: "SolversLib" | "NextFTC" = "SolversLib";

  let exportedCode = "";
  let currentLanguage: typeof java | typeof plaintext = java;
  let copied = false;
  let dialogRef: HTMLDivElement;

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

  export async function openWithFormat(
    format: "java" | "points" | "sequential",
  ) {
    exportFormat = format;
    copied = false;
    try {
      if (format === "java") {
        exportedCode = await generateJavaCode(
          startPoint,
          lines,
          exportFullCode,
          sequence,
        );
        currentLanguage = java;
      } else if (format === "points") {
        exportedCode = generatePointsArray(startPoint, lines);
        currentLanguage = plaintext;
      } else if (format === "sequential") {
        if ($currentFilePath) {
          const fileName = $currentFilePath.split(/[\\/]/).pop();
          if (fileName) {
            sequentialClassName = fileName
              .replace(".pp", "")
              .replace(/[^a-zA-Z0-9]/g, "_");
          }
        }
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
          targetLibrary,
        );
        currentLanguage = java;
      }
      isOpen = true;
      // Focus management
      await tick();
      if (dialogRef) {
        dialogRef.focus();
      }
    } catch (error) {
      console.error("Export failed:", error);
      exportedCode =
        "// Error generating code. Please check the console for details.";
      currentLanguage = plaintext;
      isOpen = true;
    }
  }

  async function refreshSequentialCode() {
    if (exportFormat === "sequential" && isOpen) {
      try {
        exportedCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          sequentialClassName,
          sequence,
          targetLibrary,
        );
      } catch (error) {
        console.error("Refresh failed:", error);
        exportedCode =
          "// Error refreshing code. Please check the console for details.";
      }
    }
  }

  function handleCopy() {
    copied = true;
    setTimeout(() => {
      copied = false;
    }, 2000);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Escape") {
      isOpen = false;
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
            {:else}Sequential Command{/if}
          </h2>
          <p class="text-xs text-neutral-500 dark:text-neutral-400">
            {#if exportFormat === "java"}
              Standard Java code for your path.
            {:else if exportFormat === "points"}
              Raw array of points for processing.
            {:else}
              Command-based sequence for {targetLibrary}.
            {/if}
          </p>
        </div>

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

      <!-- Settings Toolbar (Sequential Only) -->
      {#if exportFormat === "sequential"}
        <div
          class="px-6 py-3 bg-neutral-50 dark:bg-neutral-800/50 border-b border-neutral-200 dark:border-neutral-800 flex flex-wrap gap-6 items-end shrink-0"
        >
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
                  refreshSequentialCode();
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
                  refreshSequentialCode();
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
              on:input={refreshSequentialCode}
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
        </div>
      {/if}

      <!-- Code Content -->
      <div class="relative flex-1 min-h-0 bg-[#282b2e] overflow-hidden group">
        <div class="absolute inset-0 overflow-auto custom-scrollbar p-4">
          <Highlight
            language={currentLanguage}
            code={exportedCode}
            class="text-sm font-mono leading-relaxed"
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
