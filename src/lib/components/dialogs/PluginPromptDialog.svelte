<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { tick } from "svelte";
  import { ui } from "../../ui";

  interface Props {
    show?: boolean;
    title?: string;
    message?: string;
    defaultText?: string;
    onConfirm: (value: string) => void;
    onCancel: () => void;
  }

  let {
    show = $bindable(false),
    title = "Prompt",
    message = "",
    defaultText = "",
    onConfirm,
    onCancel,
  }: Props = $props();

  let value = $state("");
  let inputElement: HTMLInputElement | undefined = $state();

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
  let wasShown = $state(false);
  $effect(() => {
    if (show && !wasShown) {
      wasShown = true;
      value = defaultText || "";
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
  <div class="{ui.overlay} z-[1010]" role="dialog" aria-modal="true">
    <div class="{ui.dialog} w-full max-w-md p-6">
      <h2 class="{ui.title} mb-4">
        {title}
      </h2>
      <p
        class="mb-4 text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap"
      >
        {message}
      </p>

      <input
        bind:this={inputElement}
        type="text"
        bind:value
        onkeydown={handleKeydown}
        onkeyup={(e) => e.stopPropagation()}
        onkeypress={(e) => e.stopPropagation()}
        class="{ui.input} w-full mb-6"
      />

      <div class="flex justify-end gap-3">
        <button onclick={handleCancel} class={ui.btn.ghost}> Cancel </button>
        <button onclick={handleConfirm} class={ui.btn.primary}> OK </button>
      </div>
    </div>
  </div>
{/if}
