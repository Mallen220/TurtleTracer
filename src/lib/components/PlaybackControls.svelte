<script lang="ts">
  export let playing: boolean;
  export let play: () => any;
  export let pause: () => any;
  export let percent: number;
  export let handleSeek: (percent: number) => void;
  export let loopAnimation: boolean;
  export let markers: { percent: number; color: string; name: string }[] = [];
  export let playbackSpeed: number = 1.0;
  // export let changePlaybackSpeedBy: (delta: number) => void;
  export let resetPlaybackSpeed: () => void;
  export let setPlaybackSpeed: (factor: number, autoPlay?: boolean) => void;
</script>

<div
  class="w-full bg-neutral-50 dark:bg-neutral-900 rounded-lg p-3 flex flex-row justify-start items-center gap-3 shadow-lg"
>
  <button
    title="Play/Pause"
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

  <!-- Playback Speed Indicator -->
  <div class="ml-2">
    <button
      title="Cycle playback speed (0.25x - 3x). Press '1' to reset to 1x."
      aria-label="Playback speed"
      on:click={() => {
        // cycle by +0.25 and wrap to 0.25 after 3.0
        const curr = playbackSpeed || 1.0;
        const next = Math.round((curr + 0.25) * 100) / 100;
        if (next > 3.0) {
          setPlaybackSpeed(0.25, true);
        } else {
          setPlaybackSpeed(next, true);
        }
      }}
      on:keydown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          const curr = playbackSpeed || 1.0;
          const next = Math.round((curr + 0.25) * 100) / 100;
          if (next > 3.0) {
            setPlaybackSpeed(0.25, true);
          } else {
            setPlaybackSpeed(next, true);
          }
        } else if (e.key === "1") {
          e.preventDefault();
          resetPlaybackSpeed();
        }
      }}
      class="px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-xs text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      tabindex="0"
    >
      {#if playbackSpeed}
        <span>{playbackSpeed.toFixed(2)}x</span>
      {:else}
        <span>1.00x</span>
      {/if}
    </button>
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
      class="w-full appearance-none slider focus:outline-none"
      on:input={(e) => handleSeek(parseFloat(e.target.value))}
    />
  </div>
</div>
