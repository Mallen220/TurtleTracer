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
  <path
    d="M4.033,5.033l7.967,6.967M20.078,4.922l-8.078,7.078"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
