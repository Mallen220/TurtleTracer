<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/tabs/PathActionButtons.svelte -->
<script lang="ts">
  import { actionRegistry } from "../../actionRegistry";
  import { getShortcutFromSettings } from "../../../utils";
  import { PlusIcon, ClockIcon, ArrowCircleIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    settings: any;
    onAddLine: () => void;
    onHandleAddAction: (def: any) => void;
  }

  let { settings, onAddLine, onHandleAddAction }: Props = $props();
</script>

{#each Object.values($actionRegistry) as def (def.kind)}
  {#if def.createDefault || def.isPath}
    <button
      onclick={() => {
        if (def.isPath) onAddLine();
        else onHandleAddAction(def);
      }}
      title={def.isPath
        ? `Add Path${getShortcutFromSettings(settings, "add-path")}`
        : `Add ${def.label}`}
      class={ui.kindBtn(def.buttonColor || "gray")}
      aria-label={`Add ${def.label}`}
    >
      {#if def.kind === "path"}
        <PlusIcon className="size-4" strokeWidth={2} />
      {:else if def.kind === "wait"}
        <ClockIcon className="size-4" />
      {:else if def.kind === "rotate"}
        <ArrowCircleIcon className="size-4" />
      {:else if def.owner}
        <!-- A plugin's action type, in its colour. -->
        <span
          class="size-3 rounded-full border border-white/70"
          style="background-color: {def.color}"
          aria-hidden="true"
        ></span>
      {:else}
        <PlusIcon className="size-4" strokeWidth={2} />
      {/if}
      Add {def.label}
    </button>
  {/if}
{/each}
