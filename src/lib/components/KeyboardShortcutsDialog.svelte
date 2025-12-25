<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import type { Settings } from "../../types";
  import { DEFAULT_KEY_BINDINGS } from "../../config/defaults";

  export let isOpen = false;
  export let settings: Settings;

  // Use settings keyBindings if available, otherwise default
  $: keyBindings = settings?.keyBindings || DEFAULT_KEY_BINDINGS;

  // Group bindings by category for better layout (optional, or just list them)
  // For now, simple list is fine, maybe 2 columns
</script>

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    transition:fade={{ duration: 200, easing: cubicInOut }}
    class="fixed inset-0 z-[1006] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
    aria-labelledby="shortcuts-title"
    on:click|self={() => (isOpen = false)}
  >
    <div
      transition:fly={{ duration: 300, y: 20, easing: cubicInOut }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-800"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50"
      >
        <div class="flex items-center gap-3">
          <div
            class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400"
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
                d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
              />
            </svg>
          </div>
          <div>
            <h2
              id="shortcuts-title"
              class="text-xl font-bold text-neutral-900 dark:text-white"
            >
              Keyboard Shortcuts
            </h2>
            <p class="text-sm text-neutral-500 dark:text-neutral-400">
              Boost your productivity with these hotkeys
            </p>
          </div>
        </div>
        <button
          on:click={() => (isOpen = false)}
          class="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
          aria-label="Close dialog"
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
              d="M6 18 18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
          {#each keyBindings as binding}
            <div
              class="flex items-center justify-between group py-2 border-b border-neutral-100 dark:border-neutral-800 last:border-0"
            >
              <span
                class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                {binding.description}
              </span>
              <div class="flex gap-1">
                {#each binding.key.split(",") as keyGroup}
                  <span
                    class="px-2 py-1 min-w-[1.5rem] text-center text-xs font-mono font-bold bg-neutral-100 dark:bg-neutral-800 text-neutral-600 dark:text-neutral-300 rounded border border-neutral-200 dark:border-neutral-700 shadow-sm"
                  >
                    {keyGroup.trim()}
                  </span>
                {/each}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Footer -->
      <div
        class="bg-neutral-50 dark:bg-neutral-900/50 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-between items-center"
      >
        <span class="text-xs text-neutral-500 dark:text-neutral-400">
          Tip: You can customize these in Settings
        </span>
        <button
          on:click={() => (isOpen = false)}
          class="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold rounded-lg shadow-sm hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
