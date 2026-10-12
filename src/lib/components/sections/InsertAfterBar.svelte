<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- "Insert after:" followed by a button for each kind of step that can be added. -->
<script lang="ts">
  import type { ActionDefinition } from "../../../types/index";
  import { actionRegistry } from "../../actionRegistry";
  import { PlusIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    onAddAction?: (def: ActionDefinition) => void;
  }

  let { onAddAction }: Props = $props();
</script>

<div
  class="flex items-center gap-2 pt-2 border-t border-neutral-200 dark:border-neutral-700 flex-wrap"
>
  <span
    class="text-xs font-medium text-neutral-500 dark:text-neutral-400 mr-auto"
    >Insert after:</span
  >
  {#each Object.values($actionRegistry) as def (def.kind)}
    {#if def.createDefault || def.isPath}
      <button
        onclick={(e) => {
          e.stopPropagation();
          onAddAction?.(def);
        }}
        class={ui.kindChip(def.buttonColor || "gray")}
        title="Add {def.label} After"
        aria-label="Add {def.label} After"
      >
        <PlusIcon className="size-3" strokeWidth={2} />
        {def.label}
      </button>
    {/if}
  {/each}
</div>
