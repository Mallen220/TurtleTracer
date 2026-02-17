<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let percent: number;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  // New prop for timeline items (markers, waits, rotates)
  export let timelineItems: {
    type: "marker" | "wait" | "rotate" | "dot" | "macro";
    percent: number;
    durationPercent?: number;
    color?: string;
    name: string;
    explicit?: boolean; // true = user-defined action, false = implicit pathing behavior
    fromWait?: boolean; // true when the marker comes from a wait/rotate event
    id?: string;
    parentId?: string;
  }[] = [];
  export let playbackSpeed: number = 1.0;
  export let setPlaybackSpeed: (factor: number, autoPlay?: boolean) => void;
  export let totalSeconds: number = 0;
  export let settings: Settings | undefined;

  import type { Settings } from "../../types";
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import { menuNavigation } from "../actions/menuNavigation";
  import { formatTime, getShortcutFromSettings } from "../../utils";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();

  // Speed dropdown state & helpers
  let showSpeedMenu = false;
  const speedOptions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

  // Drag State
  let draggingMarkerIndex: number | null = null;
  let draggingMarkerId: string | null = null;
  let draggingMarkerPercent: number = 0;
  let wasPlayingBeforeDrag: boolean = false;
  let timelineRect: DOMRect | null = null;
  let timelineContainer: HTMLElement;
  let ignoreClick = false;

  $: currentTime =
    (draggingMarkerIndex !== null
      ? draggingMarkerPercent / 100
      : percent / 100) * totalSeconds;

  function toggleSpeedMenu() {
    showSpeedMenu = !showSpeedMenu;
  }

  function selectSpeed(s: number) {
    setPlaybackSpeed(s, true);
    showSpeedMenu = false;
  }

  function handleMenuKey(e: KeyboardEvent) {
    if (e.key === "Escape") showSpeedMenu = false;
  }

  let shiftHeld = false;

  function step(amount: number) {
    let newPercent = percent + amount;
    newPercent = Math.max(0, Math.min(100, newPercent));
    handleSeek(newPercent);
  }

  function handleSeekInput(e: Event) {
    if (draggingMarkerIndex !== null) return;
    const target = e.target as HTMLInputElement;
    let val = parseFloat(target.value);

    // Snap to markers/events if Shift is NOT held
    if (!shiftHeld) {
      let nearest: number | null = null;
      let minDist = 1.0; // 1% threshold

      // Snap to 0 and 100
      if (Math.abs(val - 0) < minDist) {
        minDist = Math.abs(val - 0);
        nearest = 0;
      }
      if (Math.abs(val - 100) < minDist) {
        minDist = Math.abs(val - 100);
        nearest = 100;
      }

      // Snap to items
      for (const item of timelineItems) {
        const dist = Math.abs(item.percent - val);
        if (dist < minDist) {
          minDist = dist;
          nearest = item.percent;
        }
        // Also snap to end of duration if present
        if (item.durationPercent && item.durationPercent > 0) {
          const endPct = item.percent + item.durationPercent;
          const distEnd = Math.abs(endPct - val);
          if (distEnd < minDist) {
            minDist = distEnd;
            nearest = endPct;
          }
        }
      }

      if (nearest !== null) {
        val = nearest;
      }
    }

    handleSeek(val);
  }

  function handleSliderKeydown(e: KeyboardEvent) {
    const step = 5;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      handleSeek(Math.max(0, percent - step));
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      handleSeek(Math.min(100, percent + step));
    } else if (e.key === "Home") {
      e.preventDefault();
      handleSeek(0);
    } else if (e.key === "End") {
      e.preventDefault();
      handleSeek(100);
    }
  }

  // Time Editing
  let isEditingTime = false;
  let timeInputValue = "";

  $: if (!isEditingTime) {
    timeInputValue = formatTime(currentTime);
  }

  function handleTimeInput(e: Event) {
    const target = e.target as HTMLInputElement;
    timeInputValue = target.value;
  }

  function handleTimeFocus() {
    isEditingTime = true;
    timeInputValue = timeInputValue.replace("s", "");
  }

  function parseTime(str: string): number {
    str = str.replace("s", "").trim();
    const parts = str.split(":");
    if (parts.length === 2) {
      return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
    }
    return parseFloat(str);
  }

  function commitTime() {
    const t = parseTime(timeInputValue);
    if (!isNaN(t) && totalSeconds > 0) {
      const pct = (t / totalSeconds) * 100;
      handleSeek(Math.max(0, Math.min(100, pct)));
    }
    isEditingTime = false;
  }

  function handleTimeKey(e: KeyboardEvent) {
    if (e.key === "Enter") {
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Escape") {
      isEditingTime = false; // Cancel
      (e.target as HTMLInputElement).blur();
    }
  }

  // Drag Handlers
  function handleMarkerDragStart(
    e: MouseEvent,
    index: number,
    item: (typeof timelineItems)[0],
  ) {
    e.preventDefault();
    e.stopPropagation();

    // Only allow dragging markers
    if (item.type !== "marker") return;
    if (!(item as any).id) return; // Must have ID

    draggingMarkerIndex = index;
    draggingMarkerId = (item as any).id;
    draggingMarkerPercent = item.percent;

    wasPlayingBeforeDrag = playing;
    if (playing) pause();

    // Cache rect
    if (timelineContainer) {
      timelineRect = timelineContainer.getBoundingClientRect();
    }

    // Add window listeners
    window.addEventListener("mousemove", handleWindowMouseMove);
    window.addEventListener("mouseup", handleWindowMouseUp);
  }

  function handleWindowMouseMove(e: MouseEvent) {
    if (draggingMarkerIndex === null || !timelineRect) return;

    let x = e.clientX - timelineRect.left;
    let pct = (x / timelineRect.width) * 100;
    pct = Math.max(0, Math.min(100, pct));

    draggingMarkerPercent = pct;
  }

  function handleWindowMouseUp(e: MouseEvent) {
    if (draggingMarkerIndex !== null) {
      // Commit change
      if (draggingMarkerId) {
        dispatch("markerChange", {
          id: draggingMarkerId,
          percent: draggingMarkerPercent,
        });
      }

      ignoreClick = true;
      setTimeout(() => (ignoreClick = false), 50);
    }

    draggingMarkerIndex = null;
    draggingMarkerId = null;
    window.removeEventListener("mousemove", handleWindowMouseMove);
    window.removeEventListener("mouseup", handleWindowMouseUp);
  }
</script>

<div
  id="playback-controls"
  class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-col justify-start items-center gap-2 shadow-lg"
>
  <!-- Timeline (Top Row) -->
  <div
    bind:this={timelineContainer}
    class="w-full relative h-10 flex items-center group/timeline"
  >
    <!-- Timeline Track & Highlights -->
    <div
      class="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-2 w-full pointer-events-none overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-700 shadow-inner"
    >
      {#each timelineItems as item}
        {#if item.type === "wait"}
          <!-- Wait: Amber highlight -->
          <div
            class="absolute top-0 bottom-0 bg-amber-500/70"
            style="left: {item.percent}%; width: {item.durationPercent}%;"
            aria-hidden="true"
          ></div>
        {:else if item.type === "rotate"}
          <!-- Rotate: Pink highlight -->
          <div
            class={item.explicit === true
              ? "absolute top-0 bottom-0 bg-pink-500/70"
              : "absolute top-0 bottom-0 bg-pink-200/40"}
            style="left: {item.percent}%; width: {item.durationPercent}%;"
            aria-hidden="true"
          ></div>
        {:else if item.type === "macro"}
          <!-- Macro: Blue highlight -->
          <div
            class="absolute top-0 bottom-0 bg-blue-500/50"
            style="left: {item.percent}%; width: {item.durationPercent}%;"
            aria-hidden="true"
          ></div>
        {/if}
      {/each}
    </div>

    <!-- Rotate Icons Overlay -->
    <div class="absolute inset-0 w-full h-full pointer-events-none">
      {#each timelineItems as item}
        {#if item.type === "rotate" && item.explicit === true}
          <!-- Center the icon in the duration; only show icon for explicit rotates -->
          <div
            class="absolute"
            style="left: {item.percent +
              (item.durationPercent || 0) /
                2}%; top: 50%; transform: translate(-50%, -50%); pointer-events: none;"
            aria-hidden="true"
          >
            <!-- Small rotate icon (explicit rotates are pink) -->
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              class="w-4 h-4 rounded-full bg-white dark:bg-neutral-900"
              style="color: rgb(236 72 153)"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </div>
        {/if}
      {/each}
    </div>

    <!-- The Slider -->
    <input
      id="timeline-slider"
      bind:value={percent}
      type="range"
      min="0"
      max="100"
      step="0.000001"
      aria-label="Animation progress"
      class="w-full appearance-none slider focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 rounded-full bg-transparent dark:bg-transparent relative z-10 timeline-slider"
      style={draggingMarkerIndex !== null ? "pointer-events: none;" : ""}
      on:input={handleSeekInput}
      on:keydown={handleSliderKeydown}
    />

    <!-- Event Markers Layer (Top, Map Pins) -->
    <!-- These need pointer events to be clickable for seeking -->
    {#each timelineItems as item, index}
      {#if item.type === "marker"}
        <!-- svelte-ignore a11y-no-static-element-interactions -->
        <div
          class="absolute z-20 group rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900"
          role="button"
          tabindex="0"
          on:mousedown={(e) => handleMarkerDragStart(e, index, item)}
          on:click={(e) => {
            if (ignoreClick) return;
            if (draggingMarkerIndex === null) handleSeek(item.percent);
          }}
          on:keydown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleSeek(item.percent);
          }}
          style="left: {draggingMarkerIndex === index
            ? draggingMarkerPercent
            : item.percent}%; top: -4px; transform: translateX(-50%); cursor: {draggingMarkerIndex ===
          index
            ? 'grabbing'
            : 'grab'}; pointer-events: auto;"
          aria-label={item.name}
        >
          <!-- Tooltip (CSS Hover) -->
          <div
            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg text-xs text-neutral-800 dark:text-neutral-100 z-[100] pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            {item.name}
          </div>

          <!-- Map Pin Icon -->
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            stroke-width="1.5"
            class={item.fromWait
              ? "w-6 h-6 drop-shadow-md transition-transform group-hover:scale-125 text-black dark:text-white stroke-white dark:stroke-neutral-900"
              : "w-6 h-6 text-purple-500 drop-shadow-md transition-transform group-hover:scale-125 stroke-white dark:stroke-neutral-900"}
            style={item.fromWait ? "" : `color: ${item.color || "#a855f7"}`}
          >
            <path
              fill-rule="evenodd"
              d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
              clip-rule="evenodd"
            />
          </svg>
        </div>
      {:else if item.type === "dot"}
        <div
          class="absolute z-20 group ring-2 ring-black/5 dark:ring-white/20 rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-neutral-900"
          role="button"
          tabindex="0"
          on:click={() => handleSeek(item.percent)}
          on:keydown={(e) => {
            if (e.key === "Enter" || e.key === " ") handleSeek(item.percent);
          }}
          style={`left: ${item.percent}%; top: 50%; transform: translate(-50%, -50%); width: 12px; height: 12px; background: ${item.color}; cursor: pointer;`}
          aria-label={item.name}
        >
          <!-- Tooltip (CSS Hover) -->
          <div
            class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded shadow-lg text-xs text-neutral-800 dark:text-neutral-100 z-[100] pointer-events-none whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200"
          >
            {item.name}
          </div>
        </div>
      {/if}
    {/each}
  </div>

  <!-- Controls (Bottom Row) -->
  <div class="flex flex-row w-full justify-between items-center">
    <!-- Playback Speed Indicator (dropdown) -->
    <div class="relative">
      <button
        title="Open playback speed menu"
        aria-label="Playback speed options"
        aria-haspopup="menu"
        aria-expanded={showSpeedMenu}
        on:click|stopPropagation={toggleSpeedMenu}
        class="flex items-center gap-2 px-3 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
        tabindex="0"
      >
        <span class="font-medium">{(playbackSpeed ?? 1).toFixed(2)}x</span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-4 text-neutral-500 dark:text-neutral-400"
          class:rotate-180={showSpeedMenu}
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {#if showSpeedMenu}
        <!-- Click anywhere else to close (window handler below) -->
        <ul
          role="menu"
          aria-label="Playback speeds"
          class="absolute left-0 bottom-full mb-2 w-36 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-lg z-50 overflow-hidden"
          on:click|stopPropagation
          on:keydown|stopPropagation
          use:menuNavigation
          on:close={() => (showSpeedMenu = false)}
          in:fly={{ y: 8, duration: 160, easing: cubicInOut }}
          out:fly={{ y: 8, duration: 120, easing: cubicInOut }}
        >
          {#each speedOptions as s}
            <li role="menuitem">
              <button
                on:click={() => selectSpeed(s)}
                on:keydown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    selectSpeed(s);
                  }
                }}
                class="w-full text-left px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center justify-between"
              >
                <span>{s.toFixed(2)}x</span>
                {#if Math.abs(s - (playbackSpeed || 1)) < 1e-6}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    class="size-4 text-green-600"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                {/if}
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </div>

    <!-- Center Controls: Play/Skip/Step -->
    <div class="flex items-center gap-2">
      <!-- Skip to Start -->
      <button
        title="Skip to Start"
        aria-label="Skip to start"
        on:click={() => handleSeek(0)}
        class="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
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
            d="M15.75 19.5L8.25 12l7.5-7.5M5.25 19.5V4.5"
          />
        </svg>
      </button>

      <!-- Step Back -->
      <button
        title="Step Back"
        aria-label="Step back"
        on:click={() => step(-0.5)}
        class="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
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
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
      </button>

      <!-- Play/Pause -->
      <button
        id="play-pause-btn"
        title={`Play/Pause${getShortcutFromSettings(settings, "play-pause")}`}
        aria-label={playing ? "Pause animation" : "Play animation"}
        on:click={() => {
          if (playing) {
            pause();
          } else {
            play();
          }
        }}
        class="p-1 rounded-full bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
      >
        {#if !playing}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-8 stroke-green-600 pl-0.5"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-8 stroke-green-600"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M15.75 5.25v13.5m-7.5-13.5v13.5"
            />
          </svg>
        {/if}
      </button>

      <!-- Step Forward -->
      <button
        title="Step Forward"
        aria-label="Step forward"
        on:click={() => step(0.5)}
        class="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
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
            d="M8.25 4.5l7.5 7.5-7.5 7.5"
          />
        </svg>
      </button>

      <!-- Skip to End -->
      <button
        title="Skip to End"
        aria-label="Skip to end"
        on:click={() => handleSeek(100)}
        class="p-1 rounded-md text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
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
            d="M8.25 4.5l7.5 7.5-7.5 7.5M18.75 4.5v15"
          />
        </svg>
      </button>
    </div>

    <!-- Right Controls: Time + Loop -->
    <div class="flex items-center gap-3">
      <!-- Time Display (Editable) -->
      <div class="relative group">
        <input
          type="text"
          value={timeInputValue}
          on:input={handleTimeInput}
          on:focus={handleTimeFocus}
          on:blur={commitTime}
          on:keydown={handleTimeKey}
          class="w-20 px-2 py-1 text-xs font-mono text-center bg-transparent border border-transparent rounded hover:border-neutral-300 dark:hover:border-neutral-600 focus:border-purple-500 focus:ring-1 focus:ring-purple-500 outline-none transition-all text-neutral-600 dark:text-neutral-400"
          aria-label="Current time"
        />
      </div>

      <!-- Loop Toggle Button -->
      <button
        title={loopAnimation ? "Disable Loop" : "Enable Loop"}
        aria-label="Loop animation"
        aria-pressed={loopAnimation}
        on:click={() => (loopAnimation = !loopAnimation)}
        class:opacity-100={loopAnimation}
        class:opacity-50={!loopAnimation}
        class="rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900"
        aria-live="polite"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6 stroke-blue-500"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
      </button>
    </div>
  </div>
</div>

<svelte:window
  on:click={() => (showSpeedMenu = false)}
  on:keydown={(e) => {
    if (e.key === "Shift") shiftHeld = true;
    if (e.key === "Escape") showSpeedMenu = false;
  }}
  on:keyup={(e) => {
    if (e.key === "Shift") shiftHeld = false;
  }}
/>

<style>
  /* Make the timeline slider track transparent so the underlying highlights layer is visible */
  .timeline-slider::-webkit-slider-runnable-track {
    background-color: transparent !important;
    box-shadow: none !important;
  }
  :global(.dark) .timeline-slider::-webkit-slider-runnable-track {
    background-color: transparent !important;
    box-shadow: none !important;
  }
</style>
