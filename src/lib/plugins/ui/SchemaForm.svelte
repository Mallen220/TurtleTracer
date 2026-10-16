<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  Draws a form a plugin described as data (api/forms.ts) with the app's own
  inputs. Values are stored in inches, degrees and seconds; numbers with a
  distance or speed unit are shown in centimetres when the user works in
  metric.
-->
<script lang="ts">
  import type { FormField, FormValues, NumberField } from "../api";
  import { ui } from "../../ui";

  interface Props {
    fields: readonly FormField[];
    values: FormValues;
    onChange: (values: FormValues) => void;
    units?: "imperial" | "metric";
    disabled?: boolean;
    /** Smaller inputs, for table rows. */
    compact?: boolean;
    /** Prefixes element ids, so two forms on a page don't clash. */
    idPrefix?: string;
  }

  let {
    fields,
    values,
    onChange,
    units = "imperial",
    disabled = false,
    compact = false,
    idPrefix = "plugin-form",
  }: Props = $props();

  const metric = $derived(units === "metric");
  const inputClass = $derived(compact ? ui.inputXs : ui.inputSm);

  /** How many shown units one stored unit is. */
  function scale(field: NumberField) {
    if (!metric) return 1;
    return field.unit === "distance" || field.unit === "speed" ? 2.54 : 1;
  }

  function unitLabel(field: NumberField) {
    switch (field.unit) {
      case "distance":
        return metric ? "cm" : "in";
      case "speed":
        return metric ? "cm/s" : "in/s";
      case "angle":
        return "°";
      case "time":
        return "s";
      default:
        return "";
    }
  }

  function shownNumber(field: NumberField) {
    const value = Number(values[field.key] ?? field.default ?? 0);
    // Rounded so converted values don't show floating-point noise.
    return Math.round(value * scale(field) * 1e6) / 1e6;
  }

  function setNumber(field: NumberField, text: string) {
    const shown = Number.parseFloat(text);
    if (!Number.isFinite(shown)) return;
    let value = shown / scale(field);
    if (field.min !== undefined) value = Math.max(field.min, value);
    if (field.max !== undefined) value = Math.min(field.max, value);
    set(field.key, value);
  }

  function set(key: string, value: string | number | boolean) {
    onChange({ ...values, [key]: value });
  }
</script>

<div
  class={compact ? "flex flex-wrap items-center gap-2" : "flex flex-col gap-3"}
>
  {#each fields as field (field.key)}
    {@const id = `${idPrefix}-${field.key}`}
    <div class={compact ? "flex items-center gap-1" : "flex flex-col gap-1"}>
      {#if field.type === "toggle"}
        <label class={ui.checkLabel} for={id}>
          <input
            {id}
            type="checkbox"
            class={ui.checkbox}
            checked={Boolean(values[field.key] ?? field.default)}
            {disabled}
            onchange={(e) => set(field.key, e.currentTarget.checked)}
          />
          {field.label}
        </label>
      {:else}
        <label
          class={compact
            ? "text-xs text-neutral-600 dark:text-neutral-300"
            : ui.label}
          for={id}>{field.label}</label
        >
        {#if field.type === "number"}
          <div class="flex items-center gap-1">
            <input
              {id}
              type="number"
              class="{inputClass} {compact ? 'w-20' : 'w-28'}"
              value={shownNumber(field)}
              min={field.min === undefined
                ? undefined
                : field.min * scale(field)}
              max={field.max === undefined
                ? undefined
                : field.max * scale(field)}
              step={field.step === undefined
                ? "any"
                : field.step * scale(field)}
              {disabled}
              onchange={(e) => setNumber(field, e.currentTarget.value)}
            />
            {#if unitLabel(field)}
              <span class="text-xs text-neutral-500 dark:text-neutral-400"
                >{unitLabel(field)}</span
              >
            {/if}
          </div>
        {:else if field.type === "select"}
          <select
            {id}
            class="{inputClass} {compact ? 'w-32' : 'w-full'}"
            value={String(values[field.key] ?? field.default ?? "")}
            {disabled}
            onchange={(e) => set(field.key, e.currentTarget.value)}
          >
            {#each field.options as option (option.value)}
              <option value={option.value}>{option.label}</option>
            {/each}
          </select>
        {:else if field.type === "color"}
          <input
            {id}
            type="color"
            class="h-7 w-10 rounded-md border border-neutral-300 dark:border-neutral-600 bg-transparent cursor-pointer disabled:cursor-not-allowed"
            value={String(values[field.key] ?? field.default ?? "#22c55e")}
            {disabled}
            onchange={(e) => set(field.key, e.currentTarget.value)}
          />
        {:else if field.type === "text" && field.multiline && !compact}
          <textarea
            {id}
            class="{inputClass} w-full min-h-20"
            placeholder={field.placeholder}
            value={String(values[field.key] ?? field.default ?? "")}
            {disabled}
            onchange={(e) => set(field.key, e.currentTarget.value)}
          ></textarea>
        {:else if field.type === "text"}
          <input
            {id}
            type="text"
            class="{inputClass} {compact ? 'w-32' : 'w-full'}"
            placeholder={field.placeholder}
            value={String(values[field.key] ?? field.default ?? "")}
            {disabled}
            onchange={(e) => set(field.key, e.currentTarget.value)}
          />
        {/if}
      {/if}
      {#if field.help && !compact}
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          {field.help}
        </p>
      {/if}
    </div>
  {/each}
</div>
