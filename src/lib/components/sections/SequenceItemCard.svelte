<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  The card shared by waits, turns and macros in the path list: a header with
  the item's name and its show/lock/move/delete buttons, the item's own
  settings, and buttons to insert another step after it.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { selectedPointId, selectedLineId } from "../../../stores";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import type { ActionDefinition, SequenceItem } from "../../../types/index";
  import { tooltipPortal } from "../../actions/portal";
  import InsertAfterBar from "./InsertAfterBar.svelte";
  import {
    ChevronRightIcon,
    LinkIcon,
    EyeIcon,
    EyeSlashIcon,
    LockIcon,
    UnlockIcon,
    ArrowUpIcon,
    ArrowDownIcon,
  } from "../icons";

  type Step = Extract<SequenceItem, { kind: "wait" | "rotate" | "macro" }>;

  // Full class names, so Tailwind can find them.
  const ACCENTS = {
    amber: {
      selected: "border-amber-400 ring-1 ring-amber-400/20",
      text: "text-amber-500",
      focus: "focus-visible:ring-amber-500",
      input: "focus:ring-amber-500/20 focus:border-amber-500",
      tooltip:
        "bg-amber-100 dark:bg-amber-900 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-100",
    },
    pink: {
      selected: "border-pink-500 ring-1 ring-pink-500/20",
      text: "text-pink-500",
      focus: "focus-visible:ring-pink-500",
      input: "focus:ring-pink-500/20 focus:border-pink-500",
      tooltip:
        "bg-pink-100 dark:bg-pink-900 border-pink-300 dark:border-pink-700 text-pink-900 dark:text-pink-100",
    },
    teal: {
      selected: "border-teal-400 ring-1 ring-teal-400/20",
      text: "text-teal-500",
      focus: "focus-visible:ring-teal-500",
      input: "focus:ring-teal-500/20 focus:border-teal-500",
      tooltip:
        "bg-teal-100 dark:bg-teal-900 border-teal-300 dark:border-teal-700 text-teal-900 dark:text-teal-100",
    },
  };

  interface Props {
    item: Step;
    sequence: SequenceItem[];
    collapsed?: boolean;
    /** "Wait", "Rotate", "Macro": shown on the card and in button labels. */
    label: string;
    accent: keyof typeof ACCENTS;
    namePlaceholder?: string;
    onRename: (name: string) => void;
    /** Shown in a tooltip when other items share this one's settings. */
    linkedNote?: string | null;
    onRemove: () => void;
    onAddAction?: (def: ActionDefinition) => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    recordChange?: () => void;
    /** Extra header buttons, before Delete. */
    headerButtons?: Snippet;
    children: Snippet;
  }

  let {
    item,
    sequence = $bindable(),
    collapsed = $bindable(false),
    label,
    accent,
    namePlaceholder = label,
    onRename,
    linkedNote = null,
    onRemove,
    onAddAction,
    onMoveUp,
    onMoveDown,
    canMoveUp = true,
    canMoveDown = true,
    recordChange,
    headerButtons,
    children,
  }: Props = $props();

  let colors = $derived(ACCENTS[accent]);
  let selectionId = $derived(`${item.kind}-${item.id}`);
  let isSelected = $derived($selectedPointId === selectionId);
  let isHidden = $derived(item.hidden ?? false);
  let linkAnchor: HTMLElement | null = $state(null);

  function select() {
    if (item.locked) return;
    selectedPointId.set(selectionId);
    selectedLineId.set(null);
  }

  function toggle(flag: "hidden" | "locked") {
    sequence = sequence.map((s) =>
      s.kind === item.kind && s.id === item.id ? { ...s, [flag]: !s[flag] } : s,
    );
    recordChange?.();
  }

  const stop = (e: Event) => e.stopPropagation();
  const iconButton = `p-1.5  hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 transition-colors focus:outline-none focus-visible:ring-2`;
  const moveButton = `p-1  hover:bg-white dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 disabled:opacity-30 disabled:hover:bg-transparent transition-all shadow-sm hover:shadow focus:outline-none focus-visible:ring-2`;
</script>

<div
  role="button"
  tabindex="0"
  aria-pressed={isSelected}
  class="bg-white dark:bg-neutral-800 shadow-sm border transition-all duration-200 {isSelected
    ? colors.selected
    : 'border-neutral-200 dark:border-neutral-700 hover:border-neutral-300 dark:hover:border-neutral-600'} {isHidden
    ? 'opacity-50 grayscale-[50%]'
    : ''}"
  onclick={(e) => {
    e.stopPropagation();
    select();
  }}
  onkeydown={(e) => {
    e.stopPropagation();
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      select();
    }
  }}
>
  <div class="flex items-center justify-between p-3 gap-3">
    <div class="flex items-center gap-3 flex-1 min-w-0">
      <button
        onclick={(e) => {
          e.stopPropagation();
          collapsed = !collapsed;
        }}
        class="flex items-center gap-2 hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-500 transition-colors px-1 py-1 focus:outline-none focus-visible:ring-2 {colors.focus}"
        title="{collapsed ? 'Expand' : 'Collapse'} {label.toLowerCase()}"
        aria-label="{collapsed ? 'Expand' : 'Collapse'} {label.toLowerCase()}"
        aria-expanded={!collapsed}
      >
        <ChevronRightIcon
          className="size-3.5 transition-transform duration-200 {collapsed
            ? 'rotate-0'
            : 'rotate-90'}"
        />
        <span
          class="text-xs font-bold uppercase tracking-wider whitespace-nowrap {colors.text}"
          >{label}</span
        >
      </button>

      <div class="relative flex-1 min-w-0">
        <input
          value={item.name}
          placeholder={namePlaceholder}
          aria-label="{label} name"
          title="Edit {label.toLowerCase()} name"
          class="w-full pl-2 pr-2 py-1.5 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 focus:ring-2 outline-none transition-all placeholder-neutral-400 truncate {colors.input} {linkAnchor
            ? colors.text
            : ''}"
          disabled={item.locked}
          oninput={(e) => onRename(e.currentTarget.value)}
          onblur={() => recordChange?.()}
          onclick={stop}
        />
        {#if linkedNote}
          <div
            role="presentation"
            class="absolute right-2 top-1/2 -translate-y-1/2 cursor-help {colors.text}"
            onmouseenter={(e) => (linkAnchor = e.currentTarget)}
            onmouseleave={() => (linkAnchor = null)}
          >
            <LinkIcon className="w-3.5 h-3.5" />
            {#if linkAnchor}
              <div
                use:tooltipPortal={linkAnchor}
                class="w-64 p-2 border rounded shadow-lg text-xs z-50 pointer-events-none {colors.tooltip}"
              >
                <strong>Linked {label}</strong><br />
                {linkedNote}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>

    <div class="flex items-center gap-1">
      <button
        onclick={(e) => {
          e.stopPropagation();
          toggle("hidden");
        }}
        class="{iconButton} {colors.focus}"
        title="{isHidden ? 'Show' : 'Hide'} {label}"
        aria-label="{isHidden ? 'Show' : 'Hide'} {label}"
      >
        {#if isHidden}
          <EyeSlashIcon className="size-4 text-neutral-400" strokeWidth={2} />
        {:else}
          <EyeIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <button
        onclick={(e) => {
          e.stopPropagation();
          toggle("locked");
        }}
        class="{iconButton} {colors.focus}"
        title="{item.locked ? 'Unlock' : 'Lock'} {label}"
        aria-label="{item.locked ? 'Unlock' : 'Lock'} {label}"
      >
        {#if item.locked}
          <LockIcon className="size-4 {colors.text}" />
        {:else}
          <UnlockIcon className="size-4" strokeWidth={2} />
        {/if}
      </button>

      <div
        class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"
        role="presentation"
        aria-hidden="true"
      ></div>

      <div class="flex items-center bg-neutral-100 dark:bg-neutral-900 p-0.5">
        <button
          onclick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          disabled={!canMoveUp || item.locked}
          class="{moveButton} {colors.focus}"
          title="Move Up"
          aria-label="Move Up"
        >
          <ArrowUpIcon className="size-3.5" />
        </button>
        <button
          onclick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          disabled={!canMoveDown || item.locked}
          class="{moveButton} {colors.focus}"
          title="Move Down"
          aria-label="Move Down"
        >
          <ArrowDownIcon className="size-3.5" />
        </button>
      </div>

      {@render headerButtons?.()}

      <DeleteButtonWithConfirm
        onclick={() => {
          if (!item.locked) onRemove();
        }}
        disabled={item.locked}
        title="Remove {label}"
      />
    </div>
  </div>

  {#if !collapsed}
    <div class="px-3 pb-3 space-y-4">
      {@render children()}

      <InsertAfterBar {onAddAction} focusClass={colors.focus} />
    </div>
  {/if}
</div>
