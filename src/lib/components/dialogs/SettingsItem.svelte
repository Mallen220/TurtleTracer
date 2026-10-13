<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { ResetIcon } from "../icons/index";
  import { ui } from "../../ui";

  interface Props {
    label: string;
    description?: string;
    searchQuery?: string;
    layout?: "col" | "row";
    section?: boolean;
    forId?: string;
    onReset?: (() => void) | undefined;
    isModified?: boolean;
    children?: import("svelte").Snippet;
  }

  let {
    label,
    description = "",
    searchQuery = "",
    layout = "col",
    section = false,
    forId = "",
    onReset = undefined,
    isModified = false,
    children,
  }: Props = $props();

  const uid = $props.id();
  const labelId = `${uid}-label`;

  /**
   * Names the form controls inside by this item's label, unless something else
   * already does. Most settings put a bare checkbox or select in a SettingsItem
   * and would otherwise have no name for a screen reader.
   */
  function labelControls(node: HTMLElement) {
    const apply = () => {
      for (const control of node.querySelectorAll<HTMLInputElement>(
        "input:not([type=hidden]), select, textarea",
      )) {
        if (control.labels?.length) continue;
        if (control.hasAttribute("aria-label")) continue;
        if (control.hasAttribute("aria-labelledby")) continue;
        control.setAttribute("aria-labelledby", labelId);
      }
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(node, { childList: true, subtree: true });
    return { destroy: () => observer.disconnect() };
  }

  let isVisible = $derived(
    searchQuery === "" ||
      label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      description.toLowerCase().includes(searchQuery.toLowerCase()),
  );
</script>

<div
  class="transition-all duration-200"
  class:hidden={!isVisible}
  class:visible-setting={isVisible}
  class:mb-4={!section && layout === "col"}
  class:mb-3={!section && layout === "row"}
>
  {#if section}
    {@render children?.()}
  {:else if layout === "col"}
    <div class="flex items-start justify-between mb-1">
      <label for={forId} id={labelId} class="{ui.label} block">
        {label}
        {#if description}
          <div
            class="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5"
          >
            {description}
          </div>
        {/if}
      </label>
      {#if onReset && isModified}
        <button
          type="button"
          class={ui.iconBtnSm.neutral}
          title="Reset to default"
          onclick={onReset}
          aria-label="Reset to default"
        >
          <ResetIcon className="w-4 h-4" />
        </button>
      {/if}
    </div>
    <div class="contents" use:labelControls>
      {@render children?.()}
    </div>
  {:else}
    <div class="{ui.card} flex items-center justify-between p-3">
      <div class="flex-1 mr-4">
        <div class="flex items-center gap-2 mb-1">
          <label for={forId} id={labelId} class="{ui.label} block">
            {label}
          </label>
          {#if onReset && isModified}
            <button
              type="button"
              class="{ui.iconBtnSm.neutral} flex-shrink-0"
              title="Reset to default"
              onclick={onReset}
              aria-label="Reset to default"
            >
              <ResetIcon className="w-4 h-4" />
            </button>
          {/if}
        </div>
        {#if description}
          <div class="text-xs text-neutral-500 dark:text-neutral-400">
            {description}
          </div>
        {/if}
      </div>
      <div class="contents" use:labelControls>
        {@render children?.()}
      </div>
    </div>
  {/if}
</div>
