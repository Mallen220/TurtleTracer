<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let percent: number;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  export let markers: { percent: number; color: string; name: string }[] = [];
  export let playbackSpeed: number = 1.0;
  export let setPlaybackSpeed: (factor: number, autoPlay?: boolean) => void;

  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";

  // Speed dropdown state & helpers
  let showSpeedMenu = false;
  const speedOptions = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0];

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

  function handleSeekInput(e: Event) {
    const target = e.target as HTMLInputElement;
    handleSeek(parseFloat(target.value));
  }
</script>

<div
  class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-row justify-start items-center gap-3 shadow-lg"
>
  <button
    title="Play/Pause"
    aria-label={playing ? "Pause animation" : "Play animation"}
    on:click={() => {
      if (playing) {
        pause();
      } else {
        play();
      }
    }}
  >
    {#if !playing}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="2"
        stroke="currentColor"
        class="size-6 stroke-green-500"
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
        class="size-6 stroke-green-500"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M15.75 5.25v13.5m-7.5-13.5v13.5"
        />
      </svg>
    {/if}
  </button>

  <!-- Loop Toggle Button -->
  <button
    title={loopAnimation ? "Disable Loop" : "Enable Loop"}
    aria-label="Loop animation"
    aria-pressed={loopAnimation}
    on:click={() => {
      loopAnimation = !loopAnimation;
    }}
    class:opacity-100={loopAnimation}
    class:opacity-50={!loopAnimation}
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

  <!-- Playback Speed Indicator (dropdown) -->
  <div class="ml-2 relative">
    <button
      title="Open playback speed menu"
      aria-label="Playback speed options"
      aria-haspopup="menu"
      aria-expanded={showSpeedMenu}
      on:click|stopPropagation={toggleSpeedMenu}
      class="flex items-center gap-2 px-3 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-sm text-neutral-800 dark:text-neutral-200 hover:bg-neutral-200 dark:hover:bg-neutral-700 focus:outline-none focus:ring-2 focus:ring-amber-500 transition-colors"
      tabindex="0"
    >
      <span class="font-medium">{(playbackSpeed || 1).toFixed(2)}x</span>
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
        class="absolute right-0 bottom-full mb-2 w-36 rounded-md bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-lg z-50 overflow-hidden"
        on:click|stopPropagation
        on:keydown={handleMenuKey}
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

  <div class="w-full relative">
    <!-- markers: small colored dots positioned by percent -->
    {#each markers as m, i}
      <div
        class="absolute"
        role="button"
        tabindex="0"
        on:click={() => handleSeek(m.percent)}
        on:keydown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleSeek(m.percent);
        }}
        style={`left: ${m.percent}%; top: 3px; transform: translateX(-50%); width: 12px; height: 12px; border-radius: 9999px; background: ${m.color}; box-shadow: 0 0 0 2px rgba(0,0,0,0.06); cursor: pointer;`}
        title={m.name}
        aria-label={m.name}
      ></div>
    {/each}

    <input
      bind:value={percent}
      type="range"
      min="0"
      max="100"
      step="0.000001"
      aria-label="Animation progress"
      class="w-full appearance-none slider focus:outline-none"
      on:input={handleSeekInput}
    />
  </div>
</div>

<svelte:window
  on:click={() => (showSpeedMenu = false)}
  on:keydown={(e) => e.key === "Escape" && (showSpeedMenu = false)}
/>
