<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { run } from "svelte/legacy";

  import { tick } from "svelte";

  interface Props {
    show?: boolean;
    defaultName?: string;
    title?: string;
    prompt?: string;
    onSave: (name: string) => void;
    onCancel: () => void;
  }

  let {
    show = $bindable(false),
    defaultName = "New Path",
    title = "Save New File",
    prompt = "Enter a name for your new file:",
    onSave,
    onCancel,
  }: Props = $props();

  let name = $state("");
  run(() => {
    if (show && !wasShown) {
      name = defaultName;
    }
  });
  let inputElement: HTMLInputElement | undefined = $state();

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
    // Stop propagation to prevent global hotkeys (like 'h' for heading) from firing
    // while typing in this dialog.
    e.stopPropagation();
    e.stopImmediatePropagation();

    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") handleCancel();
  }

  let wasShown = $state(false);
  run(() => {
    if (show && !wasShown) {
      name = defaultName;
      wasShown = true;
      tick().then(() => {
        if (inputElement) {
          inputElement.focus();
          inputElement.select();
        }
      });
    }
  });
  run(() => {
    if (!show) {
      wasShown = false;
    }
  });
</script>

{#if show}
  <div
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-sm w-full max-w-md p-6 border border-neutral-200 dark:border-neutral-700"
    >
      <h2 class="text-xl font-bold mb-4 text-neutral-900 dark:text-white">
        {title}
      </h2>
      <p class="mb-4 text-neutral-600 dark:text-neutral-400">
        {prompt}
      </p>

      <input
        bind:this={inputElement}
        type="text"
        bind:value={name}
        onkeydown={handleKeydown}
        onkeyup={(e) => e.stopPropagation()}
        onkeypress={(e) => e.stopPropagation()}
        class="w-full px-3 py-2 border rounded-md mb-6 bg-neutral-50 dark:bg-neutral-900 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none"
        placeholder="Filename"
      />

      <div class="flex justify-end gap-3">
        <button
          onclick={handleCancel}
          class="px-4 py-2 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 transition-colors"
        >
          Cancel
        </button>
        <button
          onclick={handleSave}
          class="px-4 py-2 rounded-md bg-purple-600 hover:bg-purple-700 text-white font-medium transition-colors"
        >
          Save
        </button>
      </div>
    </div>
  </div>
{/if}
