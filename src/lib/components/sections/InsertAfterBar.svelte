<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- "Insert after:" followed by a button for each kind of step that can be added. -->
<script lang="ts">
  import type { ActionDefinition } from "../../../types/index";
  import { actionRegistry } from "../../actionRegistry";
  import { getSmallButtonClass } from "../../../utils/buttonStyles";
  import { PlusIcon } from "../icons";

  interface Props {
    onAddAction?: (def: ActionDefinition) => void;
    /** Focus ring class, e.g. "focus-visible:ring-amber-500". */
    focusClass?: string;
  }

  let { onAddAction, focusClass = "focus-visible:ring-purple-500" }: Props =
    $props();
</script>

<div
  class="flex items-center gap-2 pt-2 border-t border-neutral-100 dark:border-neutral-700/50 flex-wrap"
>
  <span class="text-xs font-medium text-neutral-400 mr-auto">Insert after:</span
  >
  {#each Object.values($actionRegistry) as def (def.kind)}
    {#if def.createDefault || def.isPath}
      <button
        onclick={(e) => {
          e.stopPropagation();
          onAddAction?.(def);
        }}
        class="flex items-center gap-1.5 px-2.5 py-1.5  text-xs font-medium focus:outline-none focus-visible:ring-2 {focusClass} {getSmallButtonClass(
          def.buttonColor || 'gray',
        )}"
        title="Add {def.label} After"
        aria-label="Add {def.label} After"
      >
        <PlusIcon className="size-3" strokeWidth={2} />
        {def.label}
      </button>
    {/if}
  {/each}
</div>
