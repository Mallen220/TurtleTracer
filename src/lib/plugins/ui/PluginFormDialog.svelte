<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- A form in a dialog: for `turtle.ui.form` and for editing a plugin step. -->
<script lang="ts">
  import type { FormField, FormValues } from "../api";
  import SchemaForm from "./SchemaForm.svelte";
  import { settingsStore } from "../../projectStore";
  import { ui } from "../../ui";

  interface Props {
    title: string;
    fields: FormField[];
    values?: FormValues;
    submitLabel?: string;
    /** Who's asking, shown under the title. */
    source?: string;
    onSubmit: (values: FormValues) => void;
    onCancel: () => void;
  }

  let {
    title,
    fields,
    values = {},
    submitLabel = "OK",
    source,
    onSubmit,
    onCancel,
  }: Props = $props();

  let current = $state<FormValues>({});
  $effect.pre(() => {
    current = { ...values };
  });

  function handleKeydown(e: KeyboardEvent) {
    // Keep typing in the form away from the app's keyboard shortcuts.
    e.stopPropagation();
    if (e.key === "Escape") onCancel();
  }
</script>

<div
  class="{ui.overlay} z-[100]"
  role="dialog"
  aria-modal="true"
  aria-labelledby="plugin-form-title"
  tabindex="-1"
  onkeydown={handleKeydown}
>
  <form
    class="{ui.dialog} w-full max-w-md p-6"
    onsubmit={(e) => {
      e.preventDefault();
      onSubmit(current);
    }}
  >
    <h2 id="plugin-form-title" class="{ui.title} mb-1">{title}</h2>
    {#if source}
      <p class="mb-4 text-xs text-neutral-500 dark:text-neutral-400">
        From the {source} plugin
      </p>
    {/if}
    <div class="mb-6 max-h-[60vh] overflow-y-auto">
      <SchemaForm
        {fields}
        values={current}
        units={$settingsStore.visualizerUnits}
        onChange={(next) => (current = next)}
        idPrefix="plugin-form-dialog"
      />
    </div>
    <div class="flex justify-end gap-3">
      <button type="button" onclick={onCancel} class={ui.btn.ghost}
        >Cancel</button
      >
      <button type="submit" class={ui.btn.primary}>{submitLabel}</button>
    </div>
  </form>
</div>
