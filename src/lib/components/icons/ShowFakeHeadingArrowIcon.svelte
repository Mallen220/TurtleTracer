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
    d="M12,2.941l-3.02,6.04h6.04l-3.02-6.04Z"
    fill="none"
    stroke="currentColor"
  />
  <rect
    x="6.263"
    y="13.561"
    width="11.473"
    height="8.605"
    rx="2"
    ry="2"
    fill="none"
    stroke="currentColor"
  />
  <path d="M4.829,17.863h1.434" />
  <path d="M17.737,17.863h1.434" />
  <path d="M14.151,16.577v2.003" />
  <path d="M9.849,16.596v1.984" />
</svg>
