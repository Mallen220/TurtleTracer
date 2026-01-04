<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, onMount } from "svelte";
  import { fade } from "svelte/transition";

  export let x: number;
  export let y: number;
  export let items: {
    label: string;
    action?: string;
    onClick?: () => void;
    icon?: any; // Component or string if needed, but for now we assume icon slot or internal icon logic
    separator?: boolean;
    danger?: boolean;
    disabled?: boolean;
  }[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    action: string; // fallback if onClick is not provided
  }>();

  let menuElement: HTMLDivElement;

  function handleClickOutside(event: MouseEvent) {
    if (menuElement && !menuElement.contains(event.target as Node)) {
      dispatch("close");
    }
  }

  // Adjust position if it goes off screen
  let adjustedX = x;
  let adjustedY = y;

  onMount(() => {
    if (menuElement) {
      const rect = menuElement.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      if (x + rect.width > viewportWidth) {
        adjustedX = x - rect.width;
      }
      if (y + rect.height > viewportHeight) {
        adjustedY = y - rect.height;
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  });

  function handleItemClick(item: any) {
    if (item.disabled) return;
    if (item.onClick) {
      item.onClick();
    } else if (item.action) {
      dispatch("action", item.action);
    }
    dispatch("close");
  }
</script>

<div
  bind:this={menuElement}
  class="fixed z-[9999] min-w-[180px] py-1 bg-white dark:bg-neutral-800 rounded-lg shadow-xl border border-neutral-200 dark:border-neutral-700 text-sm select-none"
  style="top: {adjustedY}px; left: {adjustedX}px;"
  transition:fade={{ duration: 100 }}
  role="menu"
  tabindex="-1"
>
  {#each items as item}
    {#if item.separator}
      <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
    {:else}
      <button
        on:click={() => handleItemClick(item)}
        class="w-full text-left px-4 py-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 flex items-center gap-2 {item.danger
          ? 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20'
          : 'text-neutral-700 dark:text-neutral-200'} {item.disabled
          ? 'opacity-50 cursor-not-allowed'
          : ''}"
        disabled={item.disabled}
        role="menuitem"
      >
        {#if item.icon}
            <!-- If item.icon is a component, we would need <svelte:component>.
                 For simplicity, let's assume it's passed as markup or handle simple cases.
                 Or we can let the parent render icons?
                 Actually, looking at FileContextMenu, it hardcodes SVGs.
                 To be generic, let's accept an SVG string or skip icons for now if not critical,
                 or use a flexible icon slot.
                 But `items` prop makes slots hard.
                 Let's assume the user passes an SVG string or we just render text for now,
                 or we check if `icon` is a svelte component. -->
            <!-- Simpler approach: Just label for now or generic icon support later. -->
             <!-- Actually, the prompt says "implements ... using a new ContextMenu component".
                  I'll check if I need icons. The FileContextMenu has icons.
                  I will try to support icons if passed as a svelte component or HTML string. -->
             <!-- For safety/simplicity, I will assume it is a Svelte component constructor if present. -->
             {#if typeof item.icon === 'object' || typeof item.icon === 'function'}
                <svelte:component this={item.icon} class="size-4" />
             {/if}
        {/if}
        {item.label}
      </button>
    {/if}
  {/each}
</div>
