<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type {
    Point,
    Line,
    SequenceItem,
    Settings,
    Shape,
  } from "../../../types/index";
  import {
    generateJavaCode,
    generateSequentialCommandCode,
    generatePointsArray,
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
  import json from "highlight.js/lib/languages/json";
  import plaintext from "highlight.js/lib/languages/plaintext";
  import { fade, slide } from "svelte/transition";
  import { highlightAndSplit } from "../../../utils/htmlHighlighter";
  import LoadingSpinner from "../common/LoadingSpinner.svelte";
  import pkg from "../../../../package.json";
  import { customExportersStore } from "../../pluginsStore";
  import {
    CogIcon,
    ArrowDownOnSquareIcon,
    CheckIcon,
    ClipboardIcon,
  } from "../icons";

  // Register languages for core highlight.js
  hljs.registerLanguage("java", java);
  hljs.registerLanguage("json", json);
  hljs.registerLanguage("plaintext", plaintext);

  export let startPoint: Point;
  export let lines: Line[];
  export let sequence: SequenceItem[];
  export let shapes: Shape[] = [];
  export let settings: Settings;
  export let isActive: boolean = false;

  const electronAPI = (window as any).electronAPI;

  async function relativizeSequenceForPreview(seq: SequenceItem[]) {
    const cloned = structuredClone(seq);

    const base = get(currentFilePath);
    if (!electronAPI?.makeRelativePath || !base) return cloned;

    for (const item of cloned) {
      if (item.kind === "macro" && item.filePath) {
        try {
          item.filePath = await electronAPI.makeRelativePath(
            base,
            item.filePath,
          );
        } catch (err) {
          console.warn("Failed to relativize macro path for preview", err);
        }
      }
    }

    return cloned;
  }

  let code = "";
  let previousCode = "";
  let isGenerating = false;
  let format: "java" | "sequential" | "points" | "json" | "custom" = "java";
  let targetLibrary: "SolversLib" | "NextFTC" = "SolversLib";

  // Sync state with settings
  $: if (settings) {
    if (settings.autoExportFormat) {
      format = settings.autoExportFormat;
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

  // Debounced generator to avoid UI freezing
  const updateCode = debounce(async () => {
    isGenerating = true;
    try {
      let newCode = "";
      if (format === "java") {
        newCode = await generateJavaCode(
          startPoint,
          lines,
          settings.autoExportFullClass ?? true,
          sequence,
          settings.javaPackageName,
          settings.telemetryImplementation,
          settings.coordinateSystem,
          settings.codeUnits,
        );
      } else if (format === "sequential") {
        newCode = await generateSequentialCommandCode(
          startPoint,
          lines,
          null,
          sequence,
          targetLibrary,
          settings.javaPackageName,
          settings.autoExportEmbedPoseData,
          settings.coordinateSystem,
          settings.codeUnits,
        );
      } else if (format === "points") {
        newCode = generatePointsArray(startPoint, lines, settings.codeUnits);
      } else if (format === "json") {
        const relativeSequence = await relativizeSequenceForPreview(sequence);
        newCode = JSON.stringify(
          {
            version: pkg.version,
            header: {
              info: "Created with Turtle Tracer",
              copyright:
                "Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.",
              link: "https://github.com/Mallen220/TurtleTracer",
            },
            startPoint,
            lines,
            shapes,
            sequence: relativeSequence,
          },
          null,
          2,
        );
      } else if (format === "custom") {
        const exporters = get(customExportersStore);
        if (exporters.length > 0) {
          newCode =
            "// Select a custom exporter in Auto Export settings to preview its code.";
        } else {
          newCode = "// No custom exporters available.";
        }
      }

      let codeLanguage = "java";
      if (format === "points") codeLanguage = "plaintext";
      if (format === "json") codeLanguage = "json";
      if (format === "custom") codeLanguage = "plaintext";

      // If first run, just set it
      if (!code) {
        code = newCode;
        previousCode = newCode;
        const hlLines = highlightAndSplit(newCode, codeLanguage);
        displayLines = hlLines.map((content, i) => ({
          content,
          type: "unchanged",
          id: `initial-${i}`,
        }));
      } else {
        // Highlight old and new code using context-aware highlighter
        const oldLinesHL = highlightAndSplit(previousCode, codeLanguage);
        const newLinesHL = highlightAndSplit(newCode, codeLanguage);

        // Diff against previous state
        const diffs = diffLines(previousCode, newCode);
        let newDisplayLines: DiffLine[] = [];
        let lineCounter = 0;
        let oldLineIndex = 0;
        let newLineIndex = 0;

        diffs.forEach((part, partIdx) => {
          // Get line count for this part (matching old behavior of ignoring trailing newline)
          const partLinesRaw = part.value.replace(/\n$/, "").split("\n");
          const count = partLinesRaw.length;

          if (part.added) {
            // Take lines from newLinesHL
            for (let i = 0; i < count; i++) {
              newDisplayLines.push({
                content: newLinesHL[newLineIndex + i] || partLinesRaw[i],
                type: "added",
                id: `add-${partIdx}-${i}-${Date.now()}`,
              });
            }
            newLineIndex += count;
          } else if (part.removed) {
            // Take lines from oldLinesHL
            for (let i = 0; i < count; i++) {
              newDisplayLines.push({
                content: oldLinesHL[oldLineIndex + i] || partLinesRaw[i],
                type: "removed",
                id: `rem-${partIdx}-${i}-${Date.now()}`,
              });
            }
            oldLineIndex += count;
          } else {
            // Unchanged
            // Take lines from newLinesHL (same content as old)
            for (let i = 0; i < count; i++) {
              newDisplayLines.push({
                content: newLinesHL[newLineIndex + i] || partLinesRaw[i],
                type: "unchanged",
                id: `uc-${lineCounter++}`, // Preserve stable IDs if possible?
                // Re-using counter helps somewhat but isn't perfect for Svelte.
              });
            }
            oldLineIndex += count;
            newLineIndex += count;
          }
        });

        for (let i = 0; i < newDisplayLines.length - 1; i++) {
          if (
            newDisplayLines[i].type === "removed" &&
            newDisplayLines[i + 1].type === "added"
          ) {
            newDisplayLines[i + 1].type = "modified";
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
      (settings as Settings)?.codeUnits ||
      format ||
      targetLibrary)
  ) {
    updateCode();
  }

  // Force update on mount
  onMount(() => {
    if (isActive) updateCode();
  });

  export function copyCode() {
    handleCopy();
  }

  export function downloadJava() {
    handleDownloadJava();
  }

  let copyButtonText = "Copy Code";

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      copyButtonText = "Copied!";
      notification.set({
        message: "Code copied to clipboard!",
        type: "success",
      });
      setTimeout(() => {
        copyButtonText = "Copy Code";
      }, 2000);
    });
  }

  // Reset diff state when format changes
  // $: if (format || targetLibrary) {
  // }

  async function handleDownloadJava() {
    if (!code) return;

    // Prefer the project's file name if available, else try class name, else fallback
    const currentPath = get(currentFilePath);

    let ext = "java";
    if (format === "points") ext = "txt";
    if (format === "json") ext = "turt";
    if (format === "custom") ext = "txt";

    let defaultName = `AutoPath.${ext}`;
    if (currentPath) {
      const baseName = currentPath.split(/[\\\/]/).pop() || "";
      const short = baseName.replace(/\.(pp|turt)$/i, "") || "trajectory";
      defaultName = `${short}.${ext}`;
    } else if (format === "java" || format === "sequential") {
      const match = code.match(/class\s+(\w+)/);
      if (match) defaultName = `${match[1]}.java`;
    }

    let dialogTitle = "Save File";
    let filterName = "Text File";
    if (ext === "java") {
      dialogTitle = "Save Generated Java";
      filterName = "Java File";
    } else if (ext === "txt") {
      dialogTitle = "Save Points Array";
      filterName = "Text File";
    } else if (ext === "turt") {
      dialogTitle = "Save Project Data";
      filterName = "Turtle Tracer File";
    }

    try {
      if (electronAPI && electronAPI.showSaveDialog && electronAPI.writeFile) {
        const filePath = await electronAPI.showSaveDialog({
          title: dialogTitle,
          defaultPath: defaultName,
          filters: [{ name: filterName, extensions: [ext] }],
        });

        if (filePath) {
          await electronAPI.writeFile(filePath, code);
          notification.set({ message: "Saved file.", type: "success" });
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
        notification.set({ message: "Downloaded file.", type: "success" });
      }
    } catch (err) {
      console.error("Error saving file:", err);
      notification.set({ message: "Failed to save file.", type: "error" });
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
          : format === "sequential"
            ? `Sequential (${targetLibrary})`
            : format === "points"
              ? "Points Array"
              : format === "json"
                ? "Project Data (.turt)"
                : "Custom Exporter"}
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
      aria-label="Open auto export settings"
      class="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-neutral-500"
      title="Open Settings"
    >
      <CogIcon className="size-4" strokeWidth={2} />
      Auto Export Settings
    </button>

    <button
      on:click={handleDownloadJava}
      class={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonFilledClass("purple")}`}
      title={`Download as ${format === "points" || format === "custom" ? ".txt" : format === "json" ? ".turt" : ".java"}`}
      aria-label="Download generated file"
      disabled={!code}
      aria-disabled={!code}
    >
      <ArrowDownOnSquareIcon className="size-4" strokeWidth={2} />
      Download {format === "points" || format === "custom"
        ? ".txt"
        : format === "json"
          ? ".turt"
          : ".java"}
    </button>

    <button
      on:click={handleCopy}
      class={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonFilledClass("blue")} ${isGenerating || !code ? "opacity-50 cursor-not-allowed" : ""}`}
      title={copyButtonText === "Copied!" ? "Copied!" : "Copy Code"}
      disabled={isGenerating || !code}
      aria-disabled={isGenerating || !code}
      aria-label="Copy generated code"
    >
      {#if isGenerating}
        <LoadingSpinner size="sm" color="text-white" showText={false} />
        Generating...
      {:else if copyButtonText === "Copied!"}
        <CheckIcon className="size-4" strokeWidth={2} />
        Copied!
      {:else}
        <ClipboardIcon className="size-4" strokeWidth={2} />
        Copy Code
      {/if}
    </button>
  </div>

  <!-- Code Preview -->
  <div
    class="flex-1 min-h-0 overflow-hidden relative group bg-[#282b2e] outline-none"
    id="code-preview-container"
    tabindex="-1"
  >
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
