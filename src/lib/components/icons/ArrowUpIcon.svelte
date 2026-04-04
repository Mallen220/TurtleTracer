<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    width?: string;
    height?: string;
    style?: string;
    stroke?: string;
    strokeWidth?: number;
  }

  let {
    className = "size-6",
    width = "24",
    height = "24",
    style = "",
    stroke = "currentColor",
    strokeWidth = 2,
  }: Props = $props();
</script>

<svg
  {style}
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  {stroke}
  stroke-width={strokeWidth}
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  {width}
  {height}
>
  <line
    x1="12"
    y1="19"
    x2="12"
    y2="5"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <polyline
    points="5 12 12 5 19 12"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
