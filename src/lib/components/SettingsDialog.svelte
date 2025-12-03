<script lang="ts">
  import { cubicInOut } from "svelte/easing";
  import { fade, fly } from "svelte/transition";

  export let isOpen = false;
  export let settings: FPASettings;

  // Display value for angular velocity (user inputs this, gets multiplied by PI)
  $: angularVelocityDisplay = settings ? settings.aVelocity / Math.PI : 1;

  function handleAngularVelocityInput(e: Event) {
    const target = e.target as HTMLInputElement;
    settings.aVelocity = parseFloat(target.value) * Math.PI;
  }
</script>

{#if isOpen}
  <div
    transition:fade={{ duration: 500, easing: cubicInOut }}
    class="bg-black bg-opacity-25 flex flex-col justify-center items-center absolute top-0 left-0 w-full h-full z-[1005]"
    role="dialog"
    aria-modal="true"
    aria-labelledby="settings-title"
  >
    <div
      transition:fly={{ duration: 500, easing: cubicInOut, y: 20 }}
      class="flex flex-col justify-start items-start p-6 bg-white dark:bg-neutral-900 rounded-lg w-full max-w-md gap-4"
    >
      <div class="flex flex-row justify-between items-center w-full">
        <h2 id="settings-title" class="sr-only">FPA Settings</h2>
        <button on:click={() => (isOpen = false)} aria-label="Close settings">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width="2"
            stroke="currentColor"
            class="size-6 text-neutral-700 dark:text-neutral-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <div class="relative w-full">
        <div
          class="flex flex-col w-full justify-start items-start gap-4 text-base"
        >
          <div class="font-semibold text-lg">FPA Settings</div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">X Velocity (in/s):</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.1"
              type="number"
              min="0"
              bind:value={settings.xVelocity}
            />
          </div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">Y Velocity (in/s):</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.1"
              type="number"
              min="0"
              bind:value={settings.yVelocity}
            />
          </div>

          <div class="flex flex-col justify-start items-start w-full gap-1">
            <div class="flex flex-row justify-between items-center w-full">
              <div class="font-light">Angular Velocity:</div>
              <input
                class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
                step="0.1"
                type="number"
                min="0"
                value={angularVelocityDisplay}
                on:input={handleAngularVelocityInput}
              />
            </div>
            <div
              class="text-sm text-neutral-500 dark:text-neutral-400 self-end"
            >
              (× π rad/s)
            </div>
          </div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">Friction Coefficient:</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.1"
              type="number"
              min="0"
              bind:value={settings.kFriction}
            />
          </div>

          <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">Safety Margin (in):</div>
            <input
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              step="0.5"
              type="number"
              min="0"
              max="24"
              bind:value={settings.safetyMargin}
            />
          </div>

          <!-- <div class="flex flex-row justify-between items-center w-full">
            <div class="font-light">Optimization Quality:</div>
            <select
              class="px-3 py-2 rounded-md bg-neutral-100 dark:bg-neutral-950 dark:border-neutral-700 border focus:outline-none focus:ring-2 focus:ring-blue-500 w-24 text-base"
              bind:value={settings.optimizationQuality}
            >
              <option value={1}>Fast</option>
              <option value={3}>Balanced</option>
              <option value={5}>High</option>
            </select>
          </div> -->
        </div>
      </div>
    </div>
  </div>
{/if}
