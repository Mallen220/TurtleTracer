<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- Takes a Pedro constants file pasted in whole and sets the settings it has numbers for. -->
<script lang="ts">
  import type { Settings } from "../../../../types";
  import {
    readPastedConstants,
    shortNumber,
  } from "../../../../utils/robotProject";
  import { ui } from "../../../ui";
  import * as ICONS from "../../icons";

  let { settings = $bindable() }: { settings: Settings } = $props();

  let open = $state(false);
  let text = $state("");
  /** How many settings the last Apply changed; cleared when the text does. */
  let applied = $state(0);

  const pasted = $derived(readPastedConstants(text, settings));

  function apply() {
    applied = pasted.changes.length;
    settings = { ...settings, ...pasted.patch };
  }
</script>

<details class="mb-6 group" bind:open data-testid="constants-paste">
  <summary
    class="{ui.btnSm
      .accentSoft} w-full cursor-pointer select-none justify-between list-none [&::-webkit-details-marker]:hidden"
  >
    <span class="inline-flex items-center gap-2">
      <ICONS.ClipboardIcon className="size-4" />
      Fill in from your Pedro constants file
    </span>
    <ICONS.ChevronDownIcon
      className="size-4 transition-transform group-open:rotate-180"
    />
  </summary>

  <div class="mt-3 space-y-3 text-xs text-neutral-600 dark:text-neutral-400">
    <p>
      Paste your whole <code>Constants.java</code> (or <code>.kt</code>) here.
      Turtle Tracer reads the numbers written in it and offers to set the
      matching settings below. Anything it can't work out from the text is left
      alone.
    </p>

    <textarea
      id="constants-paste-text"
      aria-label="Pedro constants file"
      bind:value={text}
      oninput={() => (applied = 0)}
      rows="6"
      spellcheck="false"
      placeholder="package org.firstinspires.ftc.teamcode.pedroPathing; …"
      class="{ui.input} w-full font-mono text-[11px]"
    ></textarea>

    {#if text.trim() === ""}
      <!-- Nothing pasted yet. -->
    {:else if !pasted.recognised}
      <p data-testid="constants-paste-none">
        Nothing from Pedro found in that text. Paste the whole file, or at least
        the <code>ForesightConfig</code> block.
      </p>
    {:else if pasted.changes.length === 0}
      <p data-testid="constants-paste-done">
        {applied > 0
          ? `Set ${applied} ${applied === 1 ? "setting" : "settings"} from your file.`
          : "Everything in that file already matches your settings."}
      </p>
    {:else}
      <ul class="{ui.well} divide-y divide-neutral-200 dark:divide-neutral-700">
        {#each pasted.changes as change (change.setting)}
          <li
            class="flex flex-wrap items-baseline justify-between gap-x-3 px-2 py-1.5"
            data-testid="constants-paste-change"
          >
            <span>
              <span class="font-semibold text-neutral-800 dark:text-neutral-200"
                >{change.label}</span
              >
              <span class="text-neutral-500">from {change.source}</span>
            </span>
            <span class="font-mono break-all">
              {shortNumber(change.current)} → {shortNumber(change.value)}
            </span>
          </li>
        {/each}
      </ul>
      <button type="button" class={ui.btnSm.primary} onclick={apply}>
        Set {pasted.changes.length}
        {pasted.changes.length === 1 ? "setting" : "settings"}
      </button>
    {/if}
  </div>
</details>
