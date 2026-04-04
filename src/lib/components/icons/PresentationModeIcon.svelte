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
  <path d="M2,3h20" />
  <path
    d="M21,3v11c0,1.105-.895,2-2,2H5c-1.105,0-2-.895-2-2V3"
    fill="none"
    stroke="currentColor"
  />
  <path d="M7,21l5-4.571,5,4.571" />
</svg>
