<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
  }

  let { className = "size-6", strokeWidth = 2 }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width={strokeWidth}
  stroke="currentColor"
  class={className}
>
  <polyline
    points="4 17 10 11 4 5"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <line
    x1="12"
    y1="19"
    x2="20"
    y2="19"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
</svg>
