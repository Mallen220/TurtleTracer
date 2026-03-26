<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- src/lib/components/common/LoadingSpinner.svelte -->
<script lang="ts">
  import { SpinnerIcon } from "../icons/index";

  export let size = "md"; // sm, md, lg
  export let color = "text-purple-600 dark:text-purple-400";
  export let showText = true;
  export let text = "Loading...";

  const sizeClasses = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-12 w-12",
  };

  // Fallback for custom classes or unrecognized size
  $: svgClass = sizeClasses[size as keyof typeof sizeClasses] || sizeClasses.md;
</script>

<div class="flex flex-col items-center justify-center gap-2">
  <SpinnerIcon className={`animate-spin ${svgClass} ${color}`} />
  {#if showText}
    <span class="text-sm text-neutral-500 dark:text-neutral-400 font-medium"
      >{text}</span
    >
  {/if}
</div>
