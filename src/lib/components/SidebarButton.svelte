<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- One button in the left sidebar: an icon, plus its label when expanded. -->
<script lang="ts">
  import type { Component, Snippet } from "svelte";
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    label: string;
    expanded: boolean;
    icon?: Component<any>;
    iconClass?: string;
    /** Draw the icon yourself instead of passing `icon`. */
    iconContent?: Snippet;
    /** For toggles: whether it's on. Leave undefined for plain actions. */
    active?: boolean;
    activeClass?: string;
    /** A smaller button shown under another one, e.g. "Snap to Grid". */
    secondary?: boolean;
    /** Render as a link instead of a button. */
    href?: string;
    extraClass?: string;
    element?: HTMLElement;
  }

  // svelte-ignore custom_element_props_identifier
  let {
    label,
    expanded,
    icon: Icon,
    iconClass = "sidebar-icon-small flex-none",
    iconContent,
    active,
    activeClass = "text-blue-500 bg-blue-50 dark:bg-blue-900/20",
    secondary = false,
    href,
    extraClass = "",
    element = $bindable(),
    ...rest
  }: Props = $props();

  let tone = $derived(
    active === undefined
      ? "text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-800 disabled:opacity-30 disabled:hover:bg-transparent"
      : active
        ? activeClass
        : "text-neutral-500 dark:text-neutral-400 hover:bg-neutral-200 dark:hover:bg-neutral-800",
  );
  let classes = $derived(
    `${secondary ? "p-1" : "p-1.5"} rounded-md transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 flex items-center ${
      expanded ? "w-[calc(100%-1.1rem)] px-3" : "justify-center"
    } ${tone} ${extraClass}`,
  );
</script>

{#snippet body()}
  <div class="sidebar-icon flex-none flex items-center justify-center">
    {#if iconContent}
      {@render iconContent()}
    {:else if Icon}
      <Icon className={iconClass} />
    {/if}
  </div>
  {#if expanded}
    <span class="ml-3 truncate {secondary ? 'text-xs' : 'text-sm font-medium'}"
      >{label}</span
    >
  {/if}
{/snippet}

{#if href}
  <a
    bind:this={element}
    {href}
    target="_blank"
    rel="noreferrer"
    title={rest.title}
    aria-label={rest["aria-label"] ?? label}
    class={classes}
  >
    {@render body()}
  </a>
{:else}
  <button
    bind:this={element}
    type="button"
    aria-label={label}
    aria-pressed={active}
    {...rest}
    class={classes}
  >
    {@render body()}
  </button>
{/if}
