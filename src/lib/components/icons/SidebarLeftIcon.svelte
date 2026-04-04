<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
  }

  let { className = "size-5", strokeWidth = 2 }: Props = $props();
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
    rx="2"
    ry="2"
    fill="none"
    stroke="currentColor"
  />
  <line x1="12" y1="4" x2="12" y2="20" fill="none" stroke="currentColor" />
</svg>
