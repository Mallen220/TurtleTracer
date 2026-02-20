<!-- src/lib/components/common/LoadingSpinner.svelte -->
<script lang="ts">
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
  <svg
    class={`animate-spin ${svgClass} ${color}`}
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
  >
    <circle
      class="opacity-25"
      cx="12"
      cy="12"
      r="10"
      stroke="currentColor"
      stroke-width="4"
    ></circle>
    <path
      class="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    ></path>
  </svg>
  {#if showText}
    <span class="text-sm text-neutral-500 dark:text-neutral-400 font-medium"
      >{text}</span
    >
  {/if}
</div>
