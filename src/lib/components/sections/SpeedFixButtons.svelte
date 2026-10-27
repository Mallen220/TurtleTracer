<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  Buttons that apply a speed limit that clears a warning, e.g. "Limit this
  path to 9 in/s". Each fix was tried in the simulation. It goes in the undo
  history like any other edit.
-->
<script lang="ts">
  import {
    speedFixLabel,
    type SpeedFix,
  } from "../../../utils/timeCalculator/fixSearch";
  import { ui } from "../../ui";

  interface Props {
    fixes: SpeedFix[];
    onapply: (fix: SpeedFix) => void;
    disabled?: boolean;
  }

  let { fixes, onapply, disabled = false }: Props = $props();
</script>

{#if fixes.length > 0}
  <div class="flex flex-wrap gap-2">
    {#each fixes as fix (speedFixLabel(fix))}
      <button
        type="button"
        class={ui.btnSm.accentSoft}
        {disabled}
        onclick={(e) => {
          // These sit in rows that do something when clicked.
          e.stopPropagation();
          onapply(fix);
        }}
        onkeydown={(e) => e.stopPropagation()}
      >
        {speedFixLabel(fix)}
      </button>
    {/each}
  </div>
{/if}
