<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import TrashIcon from "../icons/TrashIcon.svelte";
  import { createEventDispatcher, onDestroy } from "svelte";
  import { fade } from "svelte/transition";

  export let disabled = false;
  export let title = "Delete";
  export let className = "";

  const dispatch = createEventDispatcher();

  let confirming = false;
  let timeout: ReturnType<typeof setTimeout>;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();

    if (disabled) return;

    if (!confirming) {
      confirming = true;
      timeout = setTimeout(() => {
        confirming = false;
      }, 3000);
    } else {
      clearTimeout(timeout);
      confirming = false;
      dispatch("click");
    }
  }

  function handleBlur() {
    // If focus is lost, reset state
    // We delay slightly so clicking "Confirm" doesn't trigger blur before click logic runs
    setTimeout(() => {
      confirming = false;
      clearTimeout(timeout);
    }, 200);
  }

  onDestroy(() => {
    clearTimeout(timeout);
  });

  // Base classes + state dependent classes
  $: baseClasses = `p-1.5 rounded-md transition-all duration-200 disabled:opacity-30 flex items-center justify-center ${className}`;
  $: stateClasses = confirming
    ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 ring-1 ring-red-500/50 w-20"
    : "hover:bg-red-50 dark:hover:bg-red-900/20 text-neutral-400 hover:text-red-500 w-8";
</script>

<button
  class="{baseClasses} {stateClasses}"
  on:click={handleClick}
  on:blur={handleBlur}
  {disabled}
  {title}
  type="button"
  aria-label={confirming ? "Confirm Deletion" : title}
  aria-live="polite"
  {...$$restProps}
>
  {#if confirming}
    <span
      class="text-xs font-bold whitespace-nowrap"
      in:fade={{ duration: 150 }}>Confirm</span
    >
  {:else}
    <div in:fade={{ duration: 150 }} class="flex items-center justify-center">
      <TrashIcon className="size-4" strokeWidth={2} />
    </div>
  {/if}
</button>
