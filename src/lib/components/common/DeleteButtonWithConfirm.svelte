<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import TrashIcon from "../icons/TrashIcon.svelte";
  import { onDestroy } from "svelte";
  import { fade } from "svelte/transition";

  interface Props {
    disabled?: boolean;
    title?: string;
    className?: string;
    onclick?: () => void;
    [key: string]: any;
  }

  let {
    disabled = false,
    title = "Delete",
    className = "",
    onclick,
    ...rest
  }: Props = $props();

  let confirming = $state(false);
  let timeout: ReturnType<typeof setTimeout>;

  function handleClick(e: MouseEvent) {
    e.stopPropagation();

    if (disabled) return;

    if (confirming) {
      clearTimeout(timeout);
      confirming = false;
      onclick?.();
    } else {
      confirming = true;
      timeout = setTimeout(() => {
        confirming = false;
      }, 3000);
    }
  }

  function handleBlur() {
    // If focus is lost, reset state
    setTimeout(() => {
      confirming = false;
      clearTimeout(timeout);
    }, 200);
  }

  onDestroy(() => {
    clearTimeout(timeout);
  });

  // Base classes + state dependent classes
  let baseClasses = $derived(
    `p-1.5 rounded-md transition-all duration-200 disabled:opacity-30 flex items-center justify-center ${className}`,
  );
  let stateClasses = $derived(
    confirming
      ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 ring-1 ring-red-500/50 w-20"
      : "hover:bg-red-50 dark:hover:bg-red-900/20 text-neutral-400 hover:text-red-500 w-8",
  );
</script>

<button
  class="{baseClasses} {stateClasses} focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
  onclick={handleClick}
  onblur={handleBlur}
  {disabled}
  {title}
  type="button"
  aria-label={confirming ? "Confirm Deletion" : title}
  aria-live="polite"
  {...rest}
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
