<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- The footer buttons of an export dialog while several files are exported from the file manager. -->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { exportCycle } from "../../../stores";
  import type { BatchExporter } from "../../../utils/batchExport";
  import { ui } from "../../ui";

  interface Props {
    /** Makes the output for the file that is open now (the dialog's own). */
    exporter: BatchExporter;
    /** Closes the dialog; the next file's dialog then opens. */
    onclose: () => void;
    /** Saves or downloads this file. The dialog closes itself when it succeeds. */
    onaction: () => void;
    disabled?: boolean;
    /** Offers "Combine into one PDF" next to Export All; only for PDF exports. */
    combine?: boolean;
    oncombine?: (combine: boolean) => void;
    children: Snippet;
  }

  let {
    exporter,
    onclose,
    onaction,
    disabled = false,
    combine = false,
    oncombine,
    children,
  }: Props = $props();

  // Loaded on use: the export dialogs shouldn't pull in the whole project store.
  async function cancelAll() {
    (await import("../../../utils/exportFromFile")).endExportSwap();
    onclose();
  }
  async function exportAll() {
    (await import("../../../utils/batchExport")).runBatch(
      exporter,
      onclose,
      combine,
    );
  }

  const remaining = $derived(
    $exportCycle ? $exportCycle.files.length - $exportCycle.index : 0,
  );
</script>

<button class={ui.btn.ghost} onclick={cancelAll}>Cancel all</button>
{#if remaining > 1 && oncombine}
  <label class="{ui.checkLabel} mr-auto text-sm">
    <input
      type="checkbox"
      class={ui.checkbox}
      checked={combine}
      onchange={(e) => oncombine(e.currentTarget.checked)}
    />
    Combine into one PDF
  </label>
{/if}
{#if remaining > 1}
  <button
    class={ui.btn.secondary}
    title="Export this file and the rest with these settings, into one folder"
    onclick={exportAll}>Export All ({remaining})</button
  >
{/if}
<button class={ui.btn.primary} {disabled} onclick={onaction}>
  {@render children()}
</button>
