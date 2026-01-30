<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    Settings,
  } from "../../../types/index";
  import {
    generateJavaCode,
    generateSequentialCommandCode,
  } from "../../../utils/codeExporter";
  import { notification } from "../../../stores";
  import { debounce } from "lodash";
  import { onMount } from "svelte";
  import { getButtonFilledClass } from "../../../utils/buttonStyles";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { diffLines } from "diff";
  import hljs from "highlight.js/lib/core";
  import java from "highlight.js/lib/languages/java";
  import { fade, slide } from "svelte/transition";

  // Register languages for core highlight.js
  hljs.registerLanguage("java", java);

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let settings: Settings;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export let recordChange: (action?: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  export let isActive: boolean = false;

  let code = "";
  let previousCode = "";
  let isGenerating = false;
  let format: "java" | "sequential" = "java";
  let targetLibrary: "SolversLib" | "NextFTC" = "SolversLib";

  interface DiffLine {
    content: string; // HTML content
    type: "added" | "removed" | "unchanged";
    id: string; // Unique ID for keying
  }

  let displayLines: DiffLine[] = [];

  // Helper to highlight code and return lines
  function getHighlightedLines(source: string): string[] {
    if (!source) return [];
    // Highlight full block
    const highlighted = hljs.highlight(source, { language: "java" }).value;
    // Split into lines - this is simplistic and might break span tags spanning newlines.
    // highlight.js usually closes spans at newlines if configured? No, standard output might span.
    // However, for diffing purposes, we need line-by-line.
    // If we split the HTML, we might get unclosed tags.
    // A robust solution is to use a plugin or just assume highlighting per line is 'okay' for diff view,
    // OR try to fix up tags.
    // Let's try highlighting each line individually for the diff view stability,
    // even though we lose context-aware highlighting (multiline comments).
    // The previous solution highlighted the whole block.
    // To support animation, we need individual elements.
    // Compromise: Highlight line-by-line for now.
    return source
      .split("\n")
      .map((line) => hljs.highlight(line, { language: "java" }).value);
  }

  // Debounced generator to avoid UI freezing
  const updateCode = debounce(async () => {
    isGenerating = true;
    try {
      let newCode = "";
      if (format === "java") {
        newCode = await generateJavaCode(startPoint, lines, true, sequence);
      } else {
        newCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          null,
          sequence,
          targetLibrary,
        );
      }

      // If first run, just set it
      if (!code) {
        code = newCode;
        previousCode = newCode;
        const hlLines = getHighlightedLines(newCode);
        displayLines = hlLines.map((content, i) => ({
          content,
          type: "unchanged",
          id: `initial-${i}`,
        }));
      } else {
        // Diff against previous state
        const diffs = diffLines(previousCode, newCode);
        let newDisplayLines: DiffLine[] = [];
        let lineCounter = 0;

        diffs.forEach((part, partIdx) => {
          // Highlight the content of this part
          // Note: removed parts come from old code, added from new code.
          // We can highlight them now.
          const lines = part.value.replace(/\n$/, "").split("\n");

          lines.forEach((lineVal, lineIdx) => {
            const hl = hljs.highlight(lineVal, { language: "java" }).value;
            if (part.added) {
              newDisplayLines.push({
                content: hl,
                type: "added",
                id: `add-${partIdx}-${lineIdx}-${Date.now()}`,
              });
            } else if (part.removed) {
              newDisplayLines.push({
                content: hl,
                type: "removed",
                id: `rem-${partIdx}-${lineIdx}-${Date.now()}`,
              });
            } else {
              newDisplayLines.push({
                content: hl,
                type: "unchanged",
                id: `uc-${lineCounter++}`, // Unchanged lines should track stable IDs if possible?
                // Actually, if we re-generate IDs for unchanged lines, they will "replace" in Svelte.
                // We should try to preserve IDs for unchanged blocks to avoid flicker.
                // But complex diffing to map to previous displayLines is hard.
                // For now, let's just render. Svelte keying is tricky here without a robust map.
              });
            }
          });
        });

        // Optimization: Coalesce adjacent Remove -> Add as "Modified" (Yellow)
        // We can just style them. But user wants "Yellow for changed".
        // A change is effectively a remove followed by an add.
        // We can post-process the list.
        // If we see REMOVE, immediately followed by ADD, mark both? Or mark ADD as 'modified'?
        // Visually, usually you show the old line (red) and new line (green/yellow).
        // If we want "Yellow", maybe we style the Added line as Yellow if it was preceded by a removal.

        for (let i = 0; i < newDisplayLines.length - 1; i++) {
          if (
            newDisplayLines[i].type === "removed" &&
            newDisplayLines[i + 1].type === "added"
          ) {
            newDisplayLines[i + 1].type = "modified"; // Custom type for styling
            // Should we hide the removed line? Usually diff shows both.
            // "If a line was just changed it should be yellow" implies inline replacement?
            // If we hide the removed line, the user doesn't see what changed.
            // But standard editor behavior for "changed" often just highlights the new line.
            // Let's keep the removed line (fading out) and show the new line as yellow.
          }
        }

        displayLines = newDisplayLines;
        previousCode = newCode;
        code = newCode;
      }
    } catch (err) {
      console.error("Error generating code:", err);
      code = "// Error generating code. See console for details.";
    } finally {
      isGenerating = false;
    }
  }, 1000);

  // Trigger update when dependencies change
  $: if (
    startPoint ||
    lines ||
    sequence ||
    settings ||
    format ||
    targetLibrary
  ) {
    updateCode();
  }

  // Force update on mount
  onMount(() => {
    updateCode();
  });

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      notification.set({
        message: "Code copied to clipboard!",
        type: "success",
      });
    });
  }

  function handleFormatChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    format = val as "java" | "sequential";
    // Reset diff state on format change
    code = "";
    previousCode = "";
    displayLines = [];
  }

  function handleLibraryChange(e: Event) {
    const val = (e.target as HTMLSelectElement).value;
    targetLibrary = val as "SolversLib" | "NextFTC";
    // Reset diff state
    code = "";
    previousCode = "";
    displayLines = [];
  }
</script>

<div
  class="w-full h-full flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-900"
>
  <!-- Toolbar -->
  <div
    class="flex-none p-4 flex flex-wrap gap-4 items-center border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
  >
    <div class="flex items-center gap-2">
      <label
        for="code-format"
        class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
        >Format:</label
      >
      <select
        id="code-format"
        value={format}
        on:change={handleFormatChange}
        class="block w-48 rounded-md border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2"
      >
        <option value="java">Java Class (Standard)</option>
        <option value="sequential">Sequential Command</option>
      </select>
    </div>

    {#if format === "sequential"}
      <div class="flex items-center gap-2">
        <label
          for="target-lib"
          class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >Library:</label
        >
        <select
          id="target-lib"
          value={targetLibrary}
          on:change={handleLibraryChange}
          class="block w-40 rounded-md border-neutral-300 dark:border-neutral-600 bg-neutral-50 dark:bg-neutral-700 text-neutral-900 dark:text-white shadow-sm focus:border-purple-500 focus:ring-purple-500 sm:text-sm p-2"
        >
          <option value="SolversLib">SolversLib</option>
          <option value="NextFTC">NextFTC</option>
        </select>
      </div>
    {/if}

    <div class="flex-1"></div>

    <button
      on:click={handleCopy}
      class={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonFilledClass("purple")}`}
      title="Copy Code"
    >
      {#if isGenerating}
        <svg
          class="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        Generating...
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
            d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
          />
        </svg>
        Copy Code
      {/if}
    </button>
  </div>

  <!-- Code Preview -->
  <div class="flex-1 min-h-0 overflow-hidden relative group bg-[#282b2e]">
    <div class="absolute inset-0 overflow-auto custom-scrollbar p-4">
      {#if displayLines.length > 0}
        <div class="font-mono text-sm leading-relaxed text-neutral-300">
          {#each displayLines as line (line.id)}
            <div
              class="w-full whitespace-pre break-all flex"
              class:bg-green-900_30={line.type === "added"}
              class:bg-red-900_30={line.type === "removed"}
              class:bg-yellow-900_30={line.type === "modified"}
              class:text-green-200={line.type === "added"}
              class:text-red-200={line.type === "removed"}
              class:text-yellow-200={line.type === "modified"}
              class:opacity-50={line.type === "removed"}
              transition:slide|local={{ duration: 200 }}
            >
              <!-- Gutter marker -->
              <span class="w-6 shrink-0 text-center select-none opacity-50">
                {#if line.type === "added"}+
                {:else if line.type === "removed"}-
                {:else if line.type === "modified"}~
                {/if}
              </span>
              <span>{@html line.content || "<br class='select-none' />"}</span>
            </div>
          {/each}
        </div>
      {:else if isGenerating}
        <div
          class="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400"
        >
          Generating preview...
        </div>
      {:else}
        <div
          class="flex items-center justify-center h-full text-neutral-500 dark:text-neutral-400"
        >
          No code generated.
        </div>
      {/if}
    </div>
  </div>
</div>

<svelte:head>
  {@html codeStyle}
</svelte:head>

<style>
  /* Custom highlighting classes */
  .bg-green-900_30 {
    background-color: rgba(20, 83, 45, 0.4);
  }
  .bg-red-900_30 {
    background-color: rgba(127, 29, 29, 0.4);
  }
  .bg-yellow-900_30 {
    background-color: rgba(113, 63, 18, 0.4);
  }
</style>
