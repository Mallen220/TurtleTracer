<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ui } from "../../ui";
  interface Props {
    show?: boolean;
    title?: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }

  let {
    show = $bindable(false),
    title = "Confirm",
    message = "",
    confirmText = "OK",
    cancelText = "Cancel",
    onConfirm,
    onCancel,
  }: Props = $props();

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
  <div class="{ui.overlay} z-[1010]" role="dialog" aria-modal="true">
    <div class="{ui.dialog} w-full max-w-md p-6">
      <h2 class="{ui.title} mb-4">
        {title}
      </h2>
      <p
        class="mb-6 text-neutral-500 dark:text-neutral-400 whitespace-pre-wrap"
      >
        {message}
      </p>

      <div class="flex justify-end gap-3">
        <button onclick={handleCancel} class={ui.btn.ghost}>
          {cancelText}
        </button>
        <button onclick={handleConfirm} class={ui.btn.primary}>
          {confirmText}
        </button>
      </div>
    </div>
  </div>
{/if}
