<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { batchProgress } from "../../../stores";
  import { cancelBatch } from "../../../utils/batchExport";
  import { ui } from "../../ui";
</script>

{#if $batchProgress}
  {@const b = $batchProgress}
  <div
    class="fixed inset-0 z-[2000] flex items-center justify-center bg-black/50"
    role="dialog"
    aria-modal="true"
    aria-labelledby="batch-progress-title"
  >
    <div class="{ui.dialog} w-full max-w-md p-5 flex flex-col gap-3">
      <h2
        id="batch-progress-title"
        class="text-lg font-semibold text-neutral-900 dark:text-neutral-100"
      >
        Exporting {b.done + 1} of {b.total}
      </h2>
      <p class="truncate text-sm text-neutral-600 dark:text-neutral-400">
        {b.name}
      </p>
      <div
        class="h-2.5 w-full rounded-full bg-neutral-200 dark:bg-neutral-700"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={Math.round(((b.done + b.fileProgress) / b.total) * 100)}
      >
        <div
          class="h-2.5 rounded-full bg-emerald-600 transition-all duration-300"
          style="width: {((b.done + b.fileProgress) / b.total) * 100}%"
        ></div>
      </div>
      <div class="flex justify-end">
        <button class={ui.btn.ghost} onclick={cancelBatch}>Cancel</button>
      </div>
    </div>
  </div>
{/if}
