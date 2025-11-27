<script lang="ts">
  import { onMount } from "svelte";
  import {
    darkMode,
    showRuler,
    showProtractor,
    showGrid,
    protractorLockToRobot,
    gridSize,
    currentFilePath,
    isUnsaved,
  } from "../stores";
  import { getRandomColor } from "../utils";
  import { getDefaultStartPoint, getDefaultLines } from "../config";
  import FileManager from "./FileManager.svelte";
  import SettingsDialog from "./components/SettingsDialog.svelte";
  import ExportCodeDialog from "./components/ExportCodeDialog.svelte";
  import { calculatePathTime, formatTime } from "../utils";

  export let loadFile: (evt: any) => any;
  export let loadRobot: (evt: any) => any;
  export let saveFile: () => any;

  export let startPoint: Point;
  export let lines: Line[];
  export let shapes: Shape[];
  export let robotWidth: number;
  export let robotHeight: number;
  export let settings: FPASettings;

  let fileManagerOpen = false;
  let settingsOpen = false;
  let exportMenuOpen = false;
  let exportDialog: ExportCodeDialog;

  let selectedGridSize = 12;
  const gridSizeOptions = [12, 24, 36, 48];

  $: timePrediction = calculatePathTime(startPoint, lines, settings);

  onMount(() => {
    const unsubscribeDarkMode = darkMode.subscribe((val) => {
      if (val === "light") {
        document.documentElement.classList.remove("dark");
      } else {
        document.documentElement.classList.add("dark");
      }
    });

    const unsubscribeGridSize = gridSize.subscribe((value) => {
      selectedGridSize = value;
    });

    return () => {
      unsubscribeDarkMode();
      unsubscribeGridSize();
    };
  });

  function handleGridSizeChange(event: Event) {
    const value = Number((event.target as HTMLSelectElement).value);
    selectedGridSize = value;
    gridSize.set(value);
  }

  function handleExport(format: "java" | "points" | "sequential") {
    exportMenuOpen = false;
    exportDialog.openWithFormat(format);
  }

  function resetPath() {
    startPoint = getDefaultStartPoint();
    lines = getDefaultLines();
    shapes = [];
  }

  $: if (settings) {
    settings.rHeight = robotHeight;
    settings.rWidth = robotWidth;
  }
</script>

{#if fileManagerOpen}
  <FileManager
    bind:isOpen={fileManagerOpen}
    bind:startPoint
    bind:lines
    bind:shapes
  />
{/if}

<ExportCodeDialog bind:this={exportDialog} bind:startPoint bind:lines />

<SettingsDialog bind:isOpen={settingsOpen} bind:settings />

<div
  class="absolute top-0 left-0 w-full bg-neutral-50 dark:bg-neutral-900 shadow-md flex flex-row justify-between items-center px-6 py-4 border-b-[0.75px] border-[#b300e6]"
>
  <!-- Title -->
  <div class="font-semibold flex flex-col justify-start items-start">
    <div class="flex flex-row items-center gap-2">
      <!-- File manager button -->
      <button title="File Manager" on:click={() => (fileManagerOpen = true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
          />
        </svg>
      </button>

      <span>Pedro Pathing Visualizer</span>
      {#if $currentFilePath}
        <span class="text-neutral-400 font-light text-sm mx-2">/</span>
        <span
          class="text-sm font-normal text-neutral-600 dark:text-neutral-300"
        >
          {$currentFilePath.split(/[\\/]/).pop()}
          {#if $isUnsaved}
            <span class="text-amber-500 font-bold ml-1" title="Unsaved changes"
              >*</span
            >
          {/if}
        </span>
      {/if}
    </div>
  </div>

  <!-- Actions -->
  <div class="flex flex-row justify-end items-center gap-4">
    <div class="flex items-center gap-3">
      <!-- time estimate -->
      <div class="flex items-center gap-2 text-sm">
        <div class="text-neutral-600 dark:text-neutral-300">
          Est: {formatTime(timePrediction.totalTime)}
        </div>
        <div class="text-neutral-500 dark:text-neutral-400">
          ({timePrediction.totalDistance.toFixed(0)} in)
        </div>
      </div>

      <!-- Grid toggle -->
      <div class="relative flex flex-col items-center justify-center">
        <button
          title="Toggle Grid"
          on:click={() => showGrid.update((v) => !v)}
          class:text-blue-500={$showGrid}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <line x1="3" y1="9" x2="21" y2="9"></line>
            <line x1="3" y1="15" x2="21" y2="15"></line>
            <line x1="9" y1="3" x2="9" y2="21"></line>
            <line x1="15" y1="3" x2="15" y2="21"></line>
          </svg>
        </button>
        {#if $showGrid}
          <div class="absolute top-full left-1/2 mt-2 -translate-x-1/2">
            <select
              class="px-2 py-1 text-sm rounded-md border border-neutral-300 dark:border-neutral-700 bg-neutral-100 dark:bg-neutral-800 shadow focus:outline-none focus:ring-2 focus:ring-blue-500"
              bind:value={selectedGridSize}
              on:change={handleGridSizeChange}
              aria-label="Select grid spacing"
            >
              {#each gridSizeOptions as option}
                <option value={option}>{option}" grid</option>
              {/each}
            </select>
          </div>
        {/if}
      </div>

      <!-- Ruler toggle -->
      <button
        title="Toggle Ruler"
        on:click={() => showRuler.update((v) => !v)}
        class:text-blue-500={$showRuler}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path
            d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0z"
          ></path>
          <path d="m14.5 12.5 2-2"></path>
          <path d="m11.5 9.5 2-2"></path>
          <path d="m8.5 6.5 2-2"></path>
          <path d="m17.5 15.5 2-2"></path>
        </svg>
      </button>

      <!-- Protractor toggle -->
      <button
        title="Toggle Protractor"
        on:click={() => showProtractor.update((v) => !v)}
        class:text-blue-500={$showProtractor}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M12 21a9 9 0 1 1 0-18c2.52 0 4.93 1 6.74 2.74L21 8"></path>
          <path d="M12 3v6l3.7 2.7"></path>
        </svg>
      </button>

      {#if $showProtractor}
        <button
          title={$protractorLockToRobot
            ? "Unlock Protractor from Robot"
            : "Lock Protractor to Robot"}
          on:click={() => protractorLockToRobot.update((v) => !v)}
          class:text-amber-500={$protractorLockToRobot}
        >
          {#if $protractorLockToRobot}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
            </svg>
          {:else}
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
              <path d="M7 11V7a5 5 0 0 1 9.9-1"></path>
            </svg>
          {/if}
        </button>
      {/if}
    </div>

    <!-- Divider -->
    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <div class="flex items-center gap-3">
      <a
        target="_blank"
        rel="norefferer"
        title="GitHub Repo"
        href="https://github.com/Mallen220/VisualizerMacOSApp"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 30 30"
          class="size-6 dark:fill-white"
        >
          <path
            d="M15,3C8.373,3,3,8.373,3,15c0,5.623,3.872,10.328,9.092,11.63C12.036,26.468,12,26.28,12,26.047v-2.051 c-0.487,0-1.303,0-1.508,0c-0.821,0-1.551-0.353-1.905-1.009c-0.393-0.729-0.461-1.844-1.435-2.526 c-0.289-0.227-0.069-0.486,0.264-0.451c0.615,0.174,1.125,0.596,1.605,1.222c0.478,0.627,0.703,0.769,1.596,0.769 c0.433,0,1.081-0.025,1.691-0.121c0.328-0.833,0.895-1.6,1.588-1.962c-3.996-0.411-5.903-2.399-5.903-5.098 c0-1.162,0.495-2.286,1.336-3.233C9.053,10.647,8.706,8.73,9.435,8c1.798,0,2.885,1.166,3.146,1.481C13.477,9.174,14.461,9,15.495,9 c1.036,0,2.024,0.174,2.922,0.483C18.675,9.17,19.763,8,21.565,8c0.732,0.731,0.381,2.656,0.102,3.594 c0.836,0.945,1.328,2.066,1.328,3.226c0,2.697-1.904,4.684-5.894,5.097C18.199,20.49,19,22.1,19,23.313v2.734 c0,0.104-0.023,0.179-0.035,0.268C23.641,24.676,27,20.236,27,15C27,8.373,21.627,3,15,3z"
          ></path>
        </svg>
      </a>
      <button title="Save trajectory as a file" on:click={() => saveFile()}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      </button>
      <input
        id="file-input"
        type="file"
        accept=".pp"
        on:change={loadFile}
        class="hidden"
      />
      <label
        for="file-input"
        title="Load trajectory from a file"
        class="cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5"
          />
        </svg>
      </label>
      <button title="Delete/Reset path" on:click={resetPath}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
          />
        </svg>
      </button>
      <div class="relative">
        <button
          title="Export path"
          on:click={() => (exportMenuOpen = !exportMenuOpen)}
          class="flex items-center gap-1"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5"
            />
          </svg>
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

        {#if exportMenuOpen}
          <div
            class="absolute right-0 mt-2 w-48 bg-white dark:bg-neutral-800 rounded-md shadow-lg py-1 z-50 border border-neutral-200 dark:border-neutral-700"
          >
            <button
              on:click={() => handleExport("java")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              Java Code
            </button>
            <button
              on:click={() => handleExport("points")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              Points Array
            </button>
            <button
              on:click={() => handleExport("sequential")}
              class="block w-full text-left px-4 py-2 text-sm text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700"
            >
              Sequential Command
            </button>
          </div>
        {/if}
      </div>
    </div>

    <div
      class="h-6 border-l border-neutral-300 dark:border-neutral-700 mx-4"
      aria-hidden="true"
    ></div>

    <div class="flex items-center gap-3">
      <button title="Open Settings" on:click={() => (settingsOpen = true)}>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><circle cx="12" cy="12" r="3"></circle><path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"
          ></path></svg
        >
      </button>
      <button
        title="Toggle Dark/Light Mode"
        on:click={() => {
          darkMode.toggle();
        }}
      >
        {#if $darkMode === "light"}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M21.752 15.002A9.72 9.72 0 0 1 18 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 0 0 3 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 0 0 9.002-5.998Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M12 3v2.25m6.364.386-1.591 1.591M21 12h-2.25m-.386 6.364-1.591-1.591M12 18.75V21m-4.773-4.227-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z"
            />
          </svg>
        {/if}
      </button>
      <input
        id="robot-input"
        type="file"
        accept="image/png"
        on:change={loadRobot}
        class="hidden"
      />
      <label
        for="robot-input"
        title="Load Robot Picture from a file"
        class="cursor-pointer"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          ><path
            d="M20 14.66V20a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5.34"
          ></path><polygon points="18 2 22 6 12 16 8 16 8 12 18 2"
          ></polygon></svg
        >
      </label>
    </div>
  </div>
</div>
