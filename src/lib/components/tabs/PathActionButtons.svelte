<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/tabs/PathActionButtons.svelte -->
<script lang="ts">
  import { actionRegistry } from "../../actionRegistry";
  import { getButtonFilledClass } from "../../../utils/buttonStyles";
  import { getShortcutFromSettings } from "../../../utils";

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
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      {:else if def.kind === "wait"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-4"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
      {:else if def.kind === "rotate"}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
          />
        </svg>
      {:else}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
      {/if}
      Add {def.label}
    </button>
  {/if}
{/each}
