<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- The strategy sheet's global options, in Settings' own style. -->
<script lang="ts">
  import type { StrategySheetOptions } from "../../../types";
  import { imageToBase64 } from "../../../utils/file";
  import { ui } from "../../ui";
  import SettingsItem from "./SettingsItem.svelte";

  type BoolKey = {
    [K in keyof StrategySheetOptions]: StrategySheetOptions[K] extends boolean
      ? K
      : never;
  }[keyof StrategySheetOptions];

  interface Props {
    opts: StrategySheetOptions;
    onchange: <K extends keyof StrategySheetOptions>(
      key: K,
      value: StrategySheetOptions[K],
    ) => void;
  }

  let { opts, onchange }: Props = $props();

  async function pickLogo(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) onchange("logo", await imageToBase64(file));
    input.value = "";
  }
</script>

{#snippet toggle(key: BoolKey, label: string, description = "")}
  <SettingsItem {label} {description} layout="row">
    <input
      type="checkbox"
      class={ui.checkbox}
      checked={opts[key]}
      onchange={(e) => onchange(key, e.currentTarget.checked)}
    />
  </SettingsItem>
{/snippet}

{#snippet group(title: string, body: import("svelte").Snippet)}
  <details class="mb-4 group" open>
    <summary
      class="cursor-pointer text-xs font-semibold uppercase text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors mb-3 list-none [&::-webkit-details-marker]:hidden"
    >
      {title}
    </summary>
    {@render body()}
  </details>
{/snippet}

{#snippet page()}
  <SettingsItem label="Paper" forId="sheet-paper">
    <select
      id="sheet-paper"
      class="{ui.input} w-full"
      value={opts.pageSize}
      onchange={(e) =>
        onchange("pageSize", e.currentTarget.value as "letter" | "a4")}
    >
      <option value="letter">Letter</option>
      <option value="a4">A4</option>
    </select>
  </SettingsItem>
  {@render toggle("landscape", "Landscape")}
  {@render toggle(
    "fitOnePage",
    "Fit to one page",
    "Shrinks the sheet instead of running onto a second page.",
  )}
{/snippet}

{#snippet header()}
  <SettingsItem label="Team name" forId="sheet-team">
    <input
      id="sheet-team"
      class="{ui.input} w-full"
      value={opts.teamName}
      oninput={(e) => onchange("teamName", e.currentTarget.value)}
    />
  </SettingsItem>
  {@render toggle(
    "showDate",
    "Show date",
    "Prints the date the sheet was made.",
  )}
  <SettingsItem label="Logo">
    <input
      id="sheet-logo"
      type="file"
      accept="image/*"
      class="hidden"
      tabindex="-1"
      onchange={pickLogo}
    />
    <div class="flex items-center gap-2">
      <button
        class={ui.btnSm.secondary}
        onclick={() => document.getElementById("sheet-logo")?.click()}
      >
        {opts.logo ? "Change" : "Choose image"}
      </button>
      {#if opts.logo}
        <img src={opts.logo} alt="Team logo" class="h-8 w-auto" />
        <button class={ui.btnSm.danger} onclick={() => onchange("logo", "")}>
          Remove
        </button>
      {/if}
    </div>
  </SettingsItem>
{/snippet}

{#snippet sections()}
  {@render toggle("showField", "Field")}
  {@render toggle("showStats", "Statistics")}
  {@render toggle("showRobot", "Robot profile")}
  {@render toggle("showSequence", "Path sequence")}
  {@render toggle("showNotes", "Notes")}
{/snippet}

{#snippet table()}
  {@render toggle(
    "colDetails",
    "Details",
    "Where a path ends, how long a wait is, or the turn angle.",
  )}
  {@render toggle("colHeading", "Heading")}
  {@render toggle("colEvents", "Events")}
  {@render toggle(
    "colTime",
    "Time",
    "How long each step takes and when it ends.",
  )}
  {@render toggle("hideWaitsAndMacros", "Hide waits and macros")}
{/snippet}

{#snippet field()}
  <SettingsItem label="Field size" forId="sheet-field-size">
    <div class="flex items-center gap-2">
      <input
        id="sheet-field-size"
        type="range"
        min="30"
        max="100"
        step="5"
        value={opts.fieldSize}
        oninput={(e) => onchange("fieldSize", Number(e.currentTarget.value))}
        class="flex-1 h-2 bg-neutral-200 dark:bg-neutral-700 rounded-md appearance-none cursor-pointer accent-emerald-600"
      />
      <span
        class="text-sm font-medium text-neutral-700 dark:text-neutral-300 min-w-[3rem] text-right"
      >
        {opts.fieldSize}%
      </span>
    </div>
  </SettingsItem>
  {@render toggle(
    "numberPaths",
    "Number the paths",
    "Marks where each path ends with its row number from the table.",
  )}
  {@render toggle(
    "inkSaver",
    "Ink saver",
    "Fades the field and draws paths in black.",
  )}
{/snippet}

<div class="p-4">
  {@render group("Page", page)}
  {@render group("Header", header)}
  {@render group("Sections", sections)}
  <!-- Options for a part the sheet leaves out are not offered. -->
  {#if opts.showSequence}
    {@render group("Table", table)}
  {/if}
  {#if opts.showField}
    {@render group("Field", field)}
  {/if}
</div>
