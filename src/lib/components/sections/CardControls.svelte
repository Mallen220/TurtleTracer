<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  The buttons on the right of a path or step card's header: show/hide,
  lock, move up and down, and delete.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import {
    EyeIcon,
    EyeSlashIcon,
    LockIcon,
    UnlockIcon,
    ArrowUpIcon,
    ArrowDownIcon,
  } from "../icons";

  interface Props {
    /** "Path", "Wait": used in the buttons' labels. */
    label: string;
    hidden: boolean;
    locked: boolean;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
    ontoggleHidden: () => void;
    ontoggleLocked: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    onRemove: () => void;
    /** Classes for the show/hide and lock buttons. */
    buttonClass: string;
    /** Classes for the move buttons. */
    moveClass: string;
    /** Colours the lock icon while locked. */
    lockedIconClass: string;
    deleteTitle: string;
    deleteClass?: string;
    /** Shown before the buttons. */
    before?: Snippet;
    /** Extra buttons, before Delete. */
    extra?: Snippet;
  }

  let {
    label,
    hidden,
    locked,
    canMoveUp = true,
    canMoveDown = true,
    ontoggleHidden,
    ontoggleLocked,
    onMoveUp,
    onMoveDown,
    onRemove,
    buttonClass,
    moveClass,
    lockedIconClass,
    deleteTitle,
    deleteClass = "",
    before,
    extra,
  }: Props = $props();
</script>

<div class="flex items-center gap-1">
  {@render before?.()}

  <button
    onclick={(e) => {
      e.stopPropagation();
      ontoggleHidden();
    }}
    class={buttonClass}
    title="{hidden ? 'Show' : 'Hide'} {label}"
    aria-label="{hidden ? 'Show' : 'Hide'} {label}"
  >
    {#if hidden}
      <EyeSlashIcon
        className="size-4 text-neutral-500 dark:text-neutral-400"
        strokeWidth={2}
      />
    {:else}
      <EyeIcon className="size-4" strokeWidth={2} />
    {/if}
  </button>

  <button
    onclick={(e) => {
      e.stopPropagation();
      ontoggleLocked();
    }}
    class={buttonClass}
    title="{locked ? 'Unlock' : 'Lock'} {label}"
    aria-label="{locked ? 'Unlock' : 'Lock'} {label}"
  >
    {#if locked}
      <LockIcon className="size-4 {lockedIconClass}" />
    {:else}
      <UnlockIcon className="size-4" strokeWidth={2} />
    {/if}
  </button>

  <div
    class="h-4 w-px bg-neutral-200 dark:bg-neutral-700 mx-1"
    role="presentation"
    aria-hidden="true"
  ></div>

  <div
    class="flex items-center bg-neutral-100 dark:bg-neutral-900 rounded-md p-0.5"
  >
    <button
      onclick={(e) => {
        e.stopPropagation();
        onMoveUp();
      }}
      disabled={!canMoveUp || locked}
      class={moveClass}
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
      disabled={!canMoveDown || locked}
      class={moveClass}
      title="Move Down"
      aria-label="Move Down"
    >
      <ArrowDownIcon className="size-3.5" />
    </button>
  </div>

  {@render extra?.()}

  <DeleteButtonWithConfirm
    onclick={() => {
      if (!locked) onRemove();
    }}
    disabled={locked}
    title={deleteTitle}
    className={deleteClass}
  />
</div>
