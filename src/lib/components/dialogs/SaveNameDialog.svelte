<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { tick } from "svelte";
  import { ui } from "../../ui";

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
  $effect(() => {
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
  $effect(() => {
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
  $effect(() => {
    if (!show) {
      wasShown = false;
    }
  });
</script>

{#if show}
  <div class="{ui.overlay} z-[9999]" role="dialog" aria-modal="true">
    <div class="{ui.dialog} w-full max-w-md p-6">
      <h2 class="{ui.title} mb-4">
        {title}
      </h2>
      <p class="mb-4 text-neutral-500 dark:text-neutral-400">
        {prompt}
      </p>

      <input
        bind:this={inputElement}
        type="text"
        bind:value={name}
        onkeydown={handleKeydown}
        onkeyup={(e) => e.stopPropagation()}
        onkeypress={(e) => e.stopPropagation()}
        class="{ui.input} w-full mb-6"
        placeholder="Filename"
      />

      <div class="flex justify-end gap-3">
        <button onclick={handleCancel} class={ui.btn.ghost}> Cancel </button>
        <button onclick={handleSave} class={ui.btn.primary}> Save </button>
      </div>
    </div>
  </div>
{/if}
