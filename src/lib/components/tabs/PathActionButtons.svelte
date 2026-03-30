<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/tabs/PathActionButtons.svelte -->
<script lang="ts">
  import { actionRegistry } from "../../actionRegistry";
  import { getButtonFilledClass } from "../../../utils/buttonStyles";
  import { getShortcutFromSettings } from "../../../utils";
  import { PlusIcon, ClockIcon, ArrowCircleIcon } from "../icons";

  export let settings: any;
  export let onAddLine: () => void;
  export let onHandleAddAction: (def: any) => void;

  function getButtonColorClass(color: string) {
    return getButtonFilledClass(color);
  }
</script>

{#each Object.values($actionRegistry) as def (def.kind)}
  {#if def.createDefault || def.isPath}
    <button
      on:click={() => {
        if (def.isPath) onAddLine();
        else onHandleAddAction(def);
      }}
      title={def.isPath
        ? `Add Path${getShortcutFromSettings(settings, "add-path")}`
        : `Add ${def.label}`}
      class={`flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-md shadow-sm transition-colors focus:outline-none focus:ring-2 ${getButtonColorClass(def.buttonColor || "gray")}`}
      aria-label={`Add ${def.label}`}
    >
      {#if def.kind === "path"}
        <PlusIcon className="size-4" strokeWidth={2} />
      {:else if def.kind === "wait"}
        <ClockIcon className="size-4" />
      {:else if def.kind === "rotate"}
        <ArrowCircleIcon className="size-4" />
      {:else}
        <PlusIcon className="size-4" strokeWidth={2} />
      {/if}
      Add {def.label}
    </button>
  {/if}
{/each}
