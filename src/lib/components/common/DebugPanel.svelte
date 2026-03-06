<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { get } from "svelte/store";
  import {
    startPointStore,
    linesStore,
    sequenceStore,
    shapesStore,
    settingsStore,
    macrosStore,
    robotXYStore,
    robotHeadingStore,
  } from "../../projectStore";
  import {
    currentFilePath,
    isUnsaved,
    currentDirectoryStore,
    notification,
  } from "../../../stores";

  export let componentName = "DebugPanel";
  export let debugMissing: string[] = [];
  export let debugInvalidRefs: string[] = [];
  export let displaySequenceLength: number | undefined = undefined;
  export let linesLength: number = 0;
  export let sequenceLength: number = 0;

  function generateDebugData() {
    return {
      timestamp: new Date().toISOString(),
      componentName,
      state: {
        startPoint: get(startPointStore),
        lines: get(linesStore),
        sequence: get(sequenceStore),
        shapes: get(shapesStore),
        settings: get(settingsStore),
        macrosKeys: Array.from(get(macrosStore).keys()),
      },
      stores: {
        currentFilePath: get(currentFilePath),
        currentDirectoryStore: get(currentDirectoryStore),
        isUnsaved: get(isUnsaved),
        robotXY: get(robotXYStore),
        robotHeading: get(robotHeadingStore),
      },
      localInfo: {
        debugMissing,
        debugInvalidRefs,
        linesLength,
        sequenceLength,
        displaySequenceLength,
      },
      appInfo: {
        userAgent: navigator.userAgent,
        windowSize: { width: window.innerWidth, height: window.innerHeight },
      }
    };
  }

  function copyDebugData() {
    const data = generateDebugData();
    navigator.clipboard.writeText(JSON.stringify(data, null, 2))
      .then(() => {
        notification.set({ message: "Debug data copied to clipboard!", type: "success" });
      })
      .catch(err => {
        console.error("Failed to copy debug data", err);
        notification.set({ message: "Failed to copy debug data.", type: "error" });
      });
  }

  function exportDebugData() {
    const dataStr = JSON.stringify(generateDebugData(), null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const downloadAnchorNode = document.createElement("a");
    downloadAnchorNode.setAttribute("href", url);
    downloadAnchorNode.setAttribute("download", `debug-log-${Date.now()}.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    URL.revokeObjectURL(url);
    notification.set({ message: "Debug log exported", type: "success" });
  }
</script>

<div class="p-3 mt-2 mb-2 text-xs text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800/50 rounded-lg border border-neutral-200 dark:border-neutral-700 shadow-sm">
  <div class="flex justify-between items-center mb-3 border-b border-neutral-200 dark:border-neutral-700 pb-2">
    <strong class="text-neutral-800 dark:text-neutral-200">DEBUG ({componentName})</strong>
    <div class="flex gap-2">
      <button
        class="px-2 py-1 bg-white dark:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-600 transition-colors shadow-sm font-medium"
        on:click={copyDebugData}
      >
        Copy to Clipboard
      </button>
      <button
        class="px-2 py-1 bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors shadow-sm font-medium"
        on:click={exportDebugData}
      >
        Export Log
      </button>
    </div>
  </div>

  <div class="space-y-2">
    <div class="flex gap-4">
      <div><span class="font-medium text-neutral-700 dark:text-neutral-300">Lines:</span> {linesLength}</div>
      <div><span class="font-medium text-neutral-700 dark:text-neutral-300">Sequence:</span> {sequenceLength}</div>
      {#if displaySequenceLength !== undefined}
        <div><span class="font-medium text-neutral-700 dark:text-neutral-300">Display:</span> {displaySequenceLength}</div>
      {/if}
    </div>

    <div>
      <span class="font-medium text-red-600 dark:text-red-400">Missing refs:</span>
      <span class="font-mono">{JSON.stringify(debugMissing)}</span>
    </div>

    <div>
      <span class="font-medium text-amber-600 dark:text-amber-500">Invalid refs:</span>
      <span class="font-mono">{JSON.stringify(debugInvalidRefs)}</span>
    </div>

    <details class="mt-3 group">
      <summary class="cursor-pointer font-medium text-blue-600 dark:text-blue-400 hover:underline select-none">View App State Snapshot</summary>
      <div class="mt-2 relative">
        <textarea
          class="w-full h-64 p-3 font-mono text-[11px] leading-tight bg-white dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded resize-y outline-none focus:ring-2 focus:ring-blue-500 text-neutral-800 dark:text-neutral-200"
          readonly
          value={JSON.stringify(generateDebugData(), null, 2)}
        ></textarea>
      </div>
    </details>
  </div>
</div>
