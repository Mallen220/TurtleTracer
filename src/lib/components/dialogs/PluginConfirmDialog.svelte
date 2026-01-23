<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  export let show = false;
  export let title = "Confirm";
  export let message = "";
  export let confirmText = "OK";
  export let cancelText = "Cancel";
  export let onConfirm: () => void;
  export let onCancel: () => void;

  function handleConfirm() {
    onConfirm();
    show = false;
  }

  function handleCancel() {
    onCancel();
    show = false;
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
        class="mb-6 text-neutral-600 dark:text-neutral-400 whitespace-pre-wrap"
      >
        {message}
      </p>

      <div class="flex justify-end gap-3">
        <button
          on:click={handleCancel}
          class="px-4 py-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          {cancelText}
        </button>
        <button
          on:click={handleConfirm}
          class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
