<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let show = false;
  export let onSave: () => void;
  export let onDiscard: () => void;
  export let onCancel: () => void;

  function handleKeydown(e: KeyboardEvent) {
    if (show && e.key === "Escape") onCancel();
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if show}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-200"
    >
      <h2 class="text-xl font-bold mb-4 text-neutral-900 dark:text-white">
        Unsaved Changes
      </h2>
      <p class="mb-6 text-neutral-600 dark:text-neutral-400">
        You have unsaved changes. Do you want to save them?
      </p>

      <div class="flex justify-end gap-3 flex-wrap">
        <button
          on:click={onCancel}
          class="px-4 py-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={onDiscard}
          class="px-4 py-2 rounded-md bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 font-medium transition-colors"
        >
          Discard Changes
        </button>
        <button
          on:click={onSave}
          class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
