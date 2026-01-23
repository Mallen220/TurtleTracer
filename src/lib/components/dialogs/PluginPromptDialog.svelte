<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { tick } from "svelte";

  export let show = false;
  export let title = "Prompt";
  export let message = "";
  export let defaultText = "";
  export let onConfirm: (value: string) => void;
  export let onCancel: () => void;

  let value = defaultText;
  let inputElement: HTMLInputElement;

  function handleConfirm() {
    onConfirm(value);
    show = false;
  }

  function handleCancel() {
    onCancel();
    show = false;
  }

  function handleKeydown(e: KeyboardEvent) {
    e.stopPropagation();
    e.stopImmediatePropagation();
    if (e.key === "Enter") handleConfirm();
    if (e.key === "Escape") handleCancel();
  }

  // Reset value when dialog opens
  let wasShown = false;
  $: if (show && !wasShown) {
    wasShown = true;
    value = defaultText || "";
    tick().then(() => {
      if (inputElement) {
        inputElement.focus();
        inputElement.select();
      }
    });
  }
  $: if (!show) {
    wasShown = false;
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-xl w-full max-w-md p-6 border border-neutral-200 dark:border-neutral-700"
    >
      <h2 class="text-xl font-bold mb-4 text-neutral-900 dark:text-white">
        {title}
      </h2>
      <p
        class="mb-4 text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap"
      >
        {message}
      </p>

      <input
        bind:this={inputElement}
        type="text"
        bind:value
        on:keydown={handleKeydown}
        on:keyup={(e) => e.stopPropagation()}
        on:keypress={(e) => e.stopPropagation()}
        class="w-full px-3 py-2 border rounded-md mb-6 bg-neutral-50 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
      />

      <div class="flex justify-end gap-3">
        <button
          on:click={handleCancel}
          class="px-4 py-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
        <button
          on:click={handleConfirm}
          class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          OK
        </button>
      </div>
    </div>
  </div>
{/if}
