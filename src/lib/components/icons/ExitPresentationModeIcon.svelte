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
  <path
    d="M9,21h-4c-1.105,0-2-.895-2-2V5c0-1.105.895-2,2-2h4"
    stroke-linejoin="round"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <polyline
    points="16 17 21 12 16 7"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <line
    x1="21"
    y1="12"
    x2="9"
    y2="12"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
</svg>
