<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import { menuNavigation } from "../../actions/menuNavigation";
  import { floatingMenu } from "../../actions/floatingMenu";
  import type { MenuEntry } from "../../../types";
  import { ui } from "../../ui";

  interface Props {
    x: number;
    y: number;
    items?: MenuEntry[];
    onclose?: () => void;
    onaction?: (action: string) => void;
  }

  let { x, y, items = [], onclose, onaction }: Props = $props();

  function portal(node: HTMLElement) {
    document.body.appendChild(node);
    return {
      destroy() {
        if (node.parentNode) {
          node.parentNode.removeChild(node);
        }
      },
    };
  }

  function handleItemClick(item: any) {
    if (item.disabled) return;
    if (item.onClick) {
      item.onClick();
    } else if (item.action) {
      onaction?.(item.action);
    }
    onclose?.();
  }
</script>

<div
  use:portal
  use:menuNavigation
  onclose={() => onclose?.()}
  use:floatingMenu={{ x, y, onclose: () => onclose?.() }}
  class="{ui.menu} fixed z-[9999] min-w-[180px] text-sm select-none"
  transition:fade={{ duration: 100 }}
  role="menu"
  tabindex="-1"
>
  {#each items as item}
    {#if item.separator}
      <div class="h-px bg-neutral-200 dark:bg-neutral-700 my-1"></div>
    {:else}
      <button
        onclick={() => handleItemClick(item)}
        class="{item.danger
          ? ui.menuItemDanger
          : ui.menuItem} justify-between {item.disabled
          ? 'opacity-50 cursor-not-allowed'
          : ''}"
        disabled={item.disabled}
        role="menuitem"
      >
        <span class="flex items-center gap-2">
          {#if typeof item.icon === "string"}
            <!-- Plugin icons, like the navbar's; plugins already run their own code. -->
            <span class="size-4 flex items-center" aria-hidden="true">
              <!-- eslint-disable-next-line svelte/no-at-html-tags -->
              {@html item.icon}
            </span>
          {:else if item.icon}
            <item.icon class="size-4" />
          {/if}
          {item.label}
        </span>
        {#if item.shortcut}
          <span
            class="text-xs text-neutral-500 dark:text-neutral-400 font-sans ml-4"
            >{item.shortcut}</span
          >
        {/if}
      </button>
    {/if}
  {/each}
</div>
