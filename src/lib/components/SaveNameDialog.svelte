<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount, tick } from "svelte";

  export let show = false;
  export let defaultName = "New Path";
  export let onSave: (name: string) => void;
  export let onCancel: () => void;

  let name = defaultName;
  let inputElement: HTMLInputElement;

  function handleSave() {
    if (name.trim()) {
      onSave(name.trim());
      show = false;
    }
  }

  function handleCancel() {
    onCancel();
    show = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  $: if (show) {
    name = defaultName;
    tick().then(() => {
      if (inputElement) {
        inputElement.focus();
        inputElement.select();
      }
    });
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-neutral-200 dark:border-neutral-700"
    >
      <h2 class="text-xl font-bold mb-4 text-neutral-900 dark:text-white">
        Save New File
      </h2>
      <p class="mb-4 text-neutral-600 dark:text-neutral-400">
        Enter a name for your new file:
      </p>

      <input
        bind:this={inputElement}
        type="text"
        bind:value={name}
        on:keydown={handleKeydown}
        class="w-full px-3 py-2 border rounded-md mb-6 bg-neutral-50 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
        placeholder="Filename"
      />

      <div class="flex justify-end gap-3">
        <button
          on:click={handleCancel}
          class="px-4 py-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={handleSave}
          class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
