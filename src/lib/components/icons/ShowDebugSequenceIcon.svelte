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
    x="8"
    y="2"
    width="8"
    height="4"
    rx="1"
    ry="1"
    fill="none"
    stroke="currentColor"
  />
  <path
    d="M16,4h2c1.105,0,2,.895,2,2v14c0,1.105-.895,2-2,2H6c-1.105,0-2-.895-2-2V6c0-1.105.895-2,2-2h2"
    fill="none"
    stroke="currentColor"
  />
</svg>
