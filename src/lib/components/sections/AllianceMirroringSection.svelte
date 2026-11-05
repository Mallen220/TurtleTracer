<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  // This project's TurtleTracerLib options: the alliance its paths are drawn
  // for, whether they may be mirrored onto the other alliance, and a preview
  // of how that looks. Options shared by every project live in Settings.
  import SectionHeader from "../common/SectionHeader.svelte";
  import {
    extraDataStore,
    mirrorPreviewStore,
    settingsStore,
  } from "../../projectStore";
  import {
    otherAlliance,
    projectAlliance,
    withProjectAlliance,
    type DrawnFor,
    type ProjectAlliance,
    type ProjectSide,
  } from "../../exporters/allianceMirroring";
  import { EyeIcon, EyeSlashIcon } from "../icons";
  import { ui } from "../../ui";

  interface Props {
    collapsed?: boolean;
    recordChange?: (action?: string) => void;
  }

  let { collapsed = $bindable(false), recordChange }: Props = $props();

  let alliance = $derived(projectAlliance($extraDataStore));
  // The alliance it would be mirrored onto; none while no alliance is set.
  let other = $derived(
    alliance.drawnFor === "NONE" ? null : otherAlliance(alliance.drawnFor),
  );
  let previewing = $derived(alliance.mirror && $mirrorPreviewStore);

  const NAMES: Record<ProjectSide, string> = {
    RED: "Red",
    BLUE: "Blue",
    NONE: "None",
  };
  const VALUE_STYLE: Record<ProjectSide, string> = {
    RED: "text-red-700 dark:text-red-300",
    BLUE: "text-blue-700 dark:text-blue-300",
    NONE: "text-neutral-500 dark:text-neutral-400",
  };
  const AXES: Record<string, string> = {
    BOTH: "turning the field 180°",
    X: "flipping it left to right",
    Y: "flipping it top to bottom",
  };

  function change(next: Partial<ProjectAlliance>, action: string) {
    extraDataStore.update((data) => withProjectAlliance(data, next));
    if (next.mirror === false || next.drawnFor === "NONE") {
      mirrorPreviewStore.set(false);
    }
    // Saved (and auto-exported) like any other edit to the project.
    recordChange?.(action);
  }

  // Each alliance shows in its own colour when picked; ui.choice's selected
  // style is the accent colour, which would fight it.
  const SIDE_BASE =
    "flex-1 px-3 py-2 text-sm rounded-md border transition-colors focus:outline-none focus-visible:ring-2";
  const SIDE_SELECTED: Record<DrawnFor, string> = {
    RED: "border-red-500 bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300 focus-visible:ring-red-500",
    BLUE: "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 focus-visible:ring-blue-500",
  };
  const SIDE_UNSELECTED =
    "bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700 focus-visible:ring-emerald-600 dark:focus-visible:ring-emerald-400";
  /** Picks an alliance; picking the one already picked clears it to NONE. */
  function pickSide(side: DrawnFor) {
    change(
      { drawnFor: alliance.drawnFor === side ? "NONE" : side },
      "Drawn For Alliance",
    );
  }

  const sideButton = (side: DrawnFor) =>
    `${SIDE_BASE} ${alliance.drawnFor === side ? SIDE_SELECTED[side] : SIDE_UNSELECTED}`;

  const help = "text-xs text-neutral-600 dark:text-neutral-400";
</script>

<div class="{ui.card} flex flex-col w-full overflow-hidden">
  <SectionHeader
    title="Alliance Selection & Path Mirroring"
    usesTurtleTracerLib="https://www.turtletracer.com/turtle-tracer-lib/auto-selector/"
    bind:collapsed
  />

  {#if !collapsed}
    <div class="p-3 flex flex-col gap-4">
      <!-- The alliance this project's paths are drawn for. -->
      <div class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <span id="ttl-drawn-for" class={ui.heading}>Drawn For</span>
          <span
            class="text-xs font-bold uppercase tracking-wider {VALUE_STYLE[
              alliance.drawnFor
            ]}"
            data-testid="drawn-for-value">{alliance.drawnFor}</span
          >
        </div>
        <div
          class="flex gap-2"
          role="radiogroup"
          aria-labelledby="ttl-drawn-for"
        >
          {#each ["RED", "BLUE"] as const as side (side)}
            <button
              type="button"
              role="radio"
              aria-checked={alliance.drawnFor === side}
              class={sideButton(side)}
              title={alliance.drawnFor === side
                ? `Click again to clear (NONE)`
                : undefined}
              onclick={() => pickSide(side)}
            >
              {NAMES[side]}
            </button>
          {/each}
        </div>
      </div>

      {#if other === null}
        <p class={help}>
          No alliance is set, so exported code runs as drawn and doesn't use
          TurtleTracerLib for it. Pick Red or Blue to set the alliance the auto
          is for, and to mirror it onto the other one.
        </p>
      {:else}
        <!-- Whether exported code may mirror it onto the other alliance. -->
        <div class="flex flex-col gap-1.5">
          <label class={ui.checkLabel}>
            <input
              type="checkbox"
              checked={alliance.mirror}
              onchange={(e) =>
                change(
                  { mirror: e.currentTarget.checked },
                  "Alliance Mirroring",
                )}
              class={ui.checkbox}
            />
            <span>Mirror to {NAMES[other]}</span>
          </label>
          <p class={help}>
            {#if alliance.mirror}
              Exported code runs as drawn on {NAMES[alliance.drawnFor]} and mirrored
              on {NAMES[other]}, chosen by the driver with TurtleTracerLib's
              auto selector. Add it to your selector with
              <code class="font-mono">Alliance.{alliance.drawnFor}</code>.
            {:else}
              Exported code runs exactly as drawn regardless of the alliance the
              driver picks, and tells TurtleTracerLib it's a {NAMES[
                alliance.drawnFor
              ]} auto, so TeleOp can read the alliance with
              <code class="font-mono">AutoSelection.alliance()</code>.
            {/if}
          </p>
        </div>

        {#if alliance.mirror}
          <!-- Show the path as it will run for the other alliance. -->
          <div class="flex flex-col gap-1.5">
            <button
              type="button"
              aria-pressed={previewing}
              class="{previewing
                ? ui.btnSm.accentSoft
                : ui.btnSm.secondary} self-start"
              onclick={() => mirrorPreviewStore.set(!previewing)}
            >
              {#if previewing}
                <EyeSlashIcon className="size-4" />
                Stop Previewing {NAMES[other]}
              {:else}
                <EyeIcon className="size-4" />
                Preview on {NAMES[other]}
              {/if}
            </button>
            <p class={help}>
              {#if previewing}
                The field shows the path mirrored onto {NAMES[other]}, by {AXES[
                  $settingsStore.exportMirrorAxes ?? "BOTH"
                ]}. Edit it here just as on {NAMES[alliance.drawnFor]}: changes
                are made to the project's own path.
              {:else}
                Shows on the field how the path runs for {NAMES[other]}. The
                field mirror is set in Settings, under Code Export.
              {/if}
            </p>
          </div>
        {/if}
      {/if}
    </div>
  {/if}
</div>
