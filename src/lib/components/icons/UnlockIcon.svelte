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
    d="M13.5,10.5v-3.75c0-2.485,2.015-4.5,4.5-4.5s4.5,2.015,4.5,4.5v3.75M3.75,21.75h10.5c1.243,0,2.25-1.007,2.25-2.25v-6.75c0-1.243-1.007-2.25-2.25-2.25H3.75c-1.243,0-2.25,1.007-2.25,2.25v6.75c0,1.243,1.007,2.25,2.25,2.25Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
