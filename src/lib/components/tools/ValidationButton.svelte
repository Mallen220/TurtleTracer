<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import {
    collisionMarkers,
    notification,
    forceShowValidation,
  } from "../../../stores";
  import { settingsStore } from "../../projectStore";
  import ValidIcon from "../icons/ValidIcon.svelte";
  import WarningIcon from "../icons/WarningIcon.svelte";
  import ErrorIcon from "../icons/ErrorIcon.svelte";
  import CriticalIcon from "../icons/CriticalIcon.svelte";
  import DisabledIcon from "../icons/DisabledIcon.svelte";
  import { get } from "svelte/store";

  let isHovering = false;

  $: $forceShowValidation = isHovering;

  // Derive error types from collision markers
  $: errorTypes = Array.from(
    new Set($collisionMarkers.map((m) => m.type || "unknown")),
  );
  $: errorCount = errorTypes.length;

  function toggleValidation() {
    let newMode: "continuous" | "on-check" | "disabled" = "on-check";

    // Cycle between on-check -> continuous -> disabled -> on-check
    if (
      !$settingsStore.continuousValidation &&
      !$settingsStore.validationDisabled
    ) {
      // currently "on-check"
      newMode = "continuous";
      notification.set({
        message: "Continuous validation enabled",
        type: "info",
        timeout: 2000,
      });
    } else if ($settingsStore.continuousValidation) {
      // currently "continuous"
      newMode = "disabled";
      notification.set({
        message: "Validation disabled",
        type: "info",
        timeout: 2000,
      });
    } else {
      // currently "disabled"
      newMode = "on-check";
      notification.set({
        message: "Validation on check enabled",
        type: "info",
        timeout: 2000,
      });
    }

    settingsStore.update((s) => ({
      ...s,
      continuousValidation: newMode === "continuous",
      validationDisabled: newMode === "disabled",
    }));
  }
</script>

<div
  class="relative flex items-center h-full"
  on:mouseenter={() => (isHovering = true)}
  on:mouseleave={() => (isHovering = false)}
  role="presentation"
>
  <button
    on:click={toggleValidation}
    class="flex items-center justify-center p-2 bg-transparent text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    aria-label="Toggle Validation"
  >
    {#if $settingsStore.validationDisabled}
      <DisabledIcon className="size-5 text-neutral-400" />
    {:else if errorCount === 0}
      <ValidIcon className="size-5 text-green-500" />
    {:else if errorCount === 1}
      <WarningIcon className="size-5 text-amber-500" />
    {:else if errorCount === 2}
      <ErrorIcon className="size-5 text-orange-500" />
    {:else}
      <CriticalIcon className="size-5 text-red-500" />
    {/if}
  </button>

  {#if isHovering}
    <div
      class="absolute top-full right-0 mt-2 w-max bg-white dark:bg-neutral-800 rounded-lg shadow-xl p-3 z-50 border border-neutral-200 dark:border-neutral-700 animate-in fade-in zoom-in-95 duration-100"
    >
      {#if $settingsStore.validationDisabled}
        <p class="text-sm text-neutral-700 dark:text-neutral-300 font-medium">
          Validation disabled
        </p>
        <p class="text-xs text-neutral-500 dark:text-neutral-400">
          Click to enable
        </p>
      {:else if errorCount === 0}
        <p class="text-sm text-green-600 dark:text-green-400 font-medium">
          Path is Valid!
        </p>
        {#if !$settingsStore.continuousValidation}
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Click to enable continuous validation
          </p>
        {:else}
          <p class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            Click to disable validation
          </p>
        {/if}
      {:else}
        <p class="text-sm text-red-600 dark:text-red-400 font-bold mb-1">
          Found Issues!
        </p>
        <ul
          class="text-xs text-neutral-700 dark:text-neutral-300 space-y-1 list-disc list-inside"
        >
          {#each errorTypes as errorType}
            <li>{errorType}</li>
          {/each}
        </ul>
        <p class="text-[10px] text-neutral-500 dark:text-neutral-400 mt-2">
          {#if !$settingsStore.continuousValidation}
            Click to enable continuous validation
          {:else}
            Click to disable validation
          {/if}
        </p>
      {/if}
    </div>
  {/if}
</div>
