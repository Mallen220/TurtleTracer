<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
  }

  let { className = "size-4", strokeWidth = 2 }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width={strokeWidth}
  stroke="currentColor"
  class={className}
>
  <path
    d="M12,7.461v9.078M16.539,12H7.461"
    stroke-linecap="round"
    stroke-linejoin="round"
    fill="none"
    stroke="currentColor"
  />
  <circle
    cx="12"
    cy="12"
    r="9.828"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
</svg>
