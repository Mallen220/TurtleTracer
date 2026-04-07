<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    color: string;
    title?: string;
    disabled?: boolean;
    tabindex?: number | undefined;
    oninput?: (e: Event) => void;
    onchange?: (e: Event) => void;
  }

  let {
    color = $bindable(),
    title = "Change Color",
    disabled = false,
    tabindex = undefined,
    oninput,
    onchange,
  }: Props = $props();

  // Use a local state for immediate feedback to avoid any lag or flickering from parent syncs
  let localColor = $state(color);

  // Sync internal state if external color changes (e.g. from undo/redo)
  $effect(() => {
    if (color !== localColor) {
      localColor = color;
    }
  });

  function handleInput(e: Event & { currentTarget: HTMLInputElement }) {
    const newVal = e.currentTarget.value;
    localColor = newVal;
    color = newVal; // Sync back to prop
    oninput?.(e);
  }

  function handleChange(e: Event & { currentTarget: HTMLInputElement }) {
    const newVal = e.currentTarget.value;
    localColor = newVal;
    color = newVal;
    onchange?.(e);
  }
</script>

<div
  class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-purple-500 dark:focus-within:ring-offset-neutral-900 transition-shadow"
  style:background-color={localColor}
>
  <input
    type="color"
    value={localColor}
    class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
    {title}
    aria-label={title}
    {disabled}
    {tabindex}
    oninput={handleInput}
    onchange={handleChange}
  />
</div>
