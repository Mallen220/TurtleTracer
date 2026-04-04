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
  <rect
    x="3"
    y="4"
    width="18"
    height="16"
    rx="1.5"
    ry="1.5"
    fill="none"
    stroke="currentColor"
  />
  <line
    x1="3"
    y1="10"
    x2="21"
    y2="10"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <line
    x1="9"
    y1="10"
    x2="9"
    y2="20"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <line
    x1="15"
    y1="10"
    x2="15"
    y2="20"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
</svg>
