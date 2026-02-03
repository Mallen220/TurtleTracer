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
  import {
    notification,
    showSettings,
    settingsActiveTab,
  } from "../../../stores";
  import { debounce } from "lodash";
  import { onMount } from "svelte";
  import { getButtonFilledClass } from "../../../utils/buttonStyles";
  import codeStyle from "svelte-highlight/styles/androidstudio";
  import { get } from "svelte/store";
  import { currentFilePath } from "../../../stores";
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
  export let isActive: boolean = false;


  const electronAPI = (window as any).electronAPI;

  let code = "";
  let previousCode = "";
  let isGenerating = false;
  let format: "java" | "sequential" = "java";
  let targetLibrary: "SolversLib" | "NextFTC" = "SolversLib";

  // Sync state with settings
  $: if (settings) {
    if (settings.autoExportFormat === "sequential") {
      format = "sequential";
    } else {
      format = "java";
    }

    if (settings.autoExportTargetLibrary) {
      targetLibrary = settings.autoExportTargetLibrary;
    }
  }

  interface DiffLine {
    content: string; // HTML content
    type: "added" | "removed" | "unchanged" | "modified";
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
        newCode = await generateJavaCode(
          startPoint,
          lines,
          true,
          sequence,
          settings.javaPackageName,
          settings.telemetryImplementation,
        );
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
    isActive &&
    (startPoint ||
      lines ||
      sequence ||
      settings ||
      format ||
      targetLibrary)
  ) {
    updateCode();
  }

  // Force update on mount
  onMount(() => {
    if (isActive) updateCode();
  });

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      notification.set({
        message: "Code copied to clipboard!",
        type: "success",
      });
    });
  }

  // Reset diff state when format changes
  $: if (format || targetLibrary) {
    // Only clear if actually changed from what we have generated
    // But since this is reactive to settings, it might clear on load?
    // We rely on `updateCode` being triggered by reactive dependencies.
    // If format changes, we should reset previousCode so we don't diff Java vs Sequential.
    // However, updateCode handles generation. We just need to reset previousCode if we want a clean slate.
    // Ideally, we reset if the *type* of code changes fundamentally.
  }

  async function handleDownloadJava() {
    if (!code) return;

    // Prefer the project's .pp filename if available, else try class name, else fallback
    const currentPath = get(currentFilePath);
    let defaultName = "AutoPath.java";
    if (currentPath) {
      const baseName = currentPath.split(/[\\\/]/).pop() || "";
      const short = baseName.replace(/\.pp$/i, "") || "trajectory";
      defaultName = `${short}.java`;
    } else {
      const match = code.match(/class\s+(\w+)/);
      if (match) defaultName = `${match[1]}.java`;
    }

    try {
      if (electronAPI && electronAPI.showSaveDialog && electronAPI.writeFile) {
        const filePath = await electronAPI.showSaveDialog({
          title: "Save Generated Java",
          defaultPath: defaultName,
          filters: [{ name: "Java File", extensions: ["java"] }],
        });

        if (filePath) {
          await electronAPI.writeFile(filePath, code);
          notification.set({ message: "Saved Java file.", type: "success" });
        }
      } else {
        // Web fallback: Blob download
        const blob = new Blob([code], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        notification.set({ message: "Downloaded Java file.", type: "success" });
      }
    } catch (err) {
      console.error("Error saving Java file:", err);
      notification.set({ message: "Failed to save Java file.", type: "error" });
    }
  }
</script>

<div
  class="w-full h-full flex flex-col overflow-hidden bg-neutral-50 dark:bg-neutral-900"
>
  <!-- Toolbar -->
  <div
    class="flex-none p-4 flex flex-wrap gap-4 items-center border-b border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
  >
    <div class="flex flex-col gap-0.5">
      <div class="text-sm font-medium text-neutral-900 dark:text-white">
        Previewing: {format === "java"
          ? "Java Class (Standard)"
          : `Sequential (${targetLibrary})`}
      </div>
      <div class="text-xs text-neutral-500 dark:text-neutral-400">
        Output format is controlled by Auto Export settings.
      </div>
    </div>

    <div class="flex-1"></div>

    <button
      on:click={() => {
        settingsActiveTab.set("code-export");
        showSettings.set(true);
      }}
      class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500"
      title="Open Settings"
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
          d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 0 1 0 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 0 1 0-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281Z"
        />
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        />
      </svg>
      Auto Export Settings
    </button>

    <button
      on:click={handleDownloadJava}
      class={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonFilledClass("purple")}`}
      title="Download as .java"
      aria-label="Download generated Java file"
      disabled={!code}
      aria-disabled={!code}
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
          d="M12 3v12m0 0l4-4m-4 4-4-4M21 21H3"
        />
      </svg>
      Download .java
    </button>

    <button
      on:click={handleCopy}
      class={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonFilledClass("blue")}`}
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
    <div class="inset-0 custom-scrollbar p-4 pt-4 pb-0 flex flex-col h-full">
      {#if displayLines.length > 0}
        <div
          class="font-mono text-sm leading-relaxed text-neutral-300 flex-1 overflow-auto"
        >
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
          class="flex-1 flex items-center justify-center text-neutral-500 dark:text-neutral-400"
        >
          Generating preview...
        </div>
      {:else}
        <div
          class="flex-1 flex items-center justify-center text-neutral-500 dark:text-neutral-400"
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
