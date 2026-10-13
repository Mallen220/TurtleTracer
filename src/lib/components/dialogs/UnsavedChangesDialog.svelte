<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ui } from "../../ui";
  interface Props {
    show?: boolean;
    onSave: () => void;
    onDiscard: () => void;
    onCancel: () => void;
  }

  let {
    show = $bindable(false),
    onSave,
    onDiscard,
    onCancel,
  }: Props = $props();

  function handleKeydown(e: KeyboardEvent) {
    if (show && e.key === "Escape") onCancel();
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if show}
  <div class="{ui.overlay} z-[9999]" role="dialog" aria-modal="true">
    <div
      class="{ui.dialog} w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200"
    >
      <h2 class="{ui.title} mb-4">Unsaved Changes</h2>
      <p class="mb-6 text-neutral-500 dark:text-neutral-400">
        You have unsaved changes. Do you want to save them?
      </p>

      <div class="flex justify-end gap-3 flex-wrap">
        <button onclick={onCancel} class={ui.btn.ghost}> Cancel </button>
        <button onclick={onDiscard} class={ui.btn.dangerSoft}>
          Discard Changes
        </button>
        <button onclick={onSave} class={ui.btn.primary}> Save </button>
      </div>
    </div>
  </div>
{/if}
