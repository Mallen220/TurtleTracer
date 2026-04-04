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
    d="M7.5,14.25v2.25M10.5,12v4.5M13.5,9.75v6.75M16.5,7.5v9M6,20.25h12c1.243,0,2.25-1.007,2.25-2.25V6c0-1.243-1.007-2.25-2.25-2.25H6c-1.243,0-2.25,1.007-2.25,2.25v12c0,1.243,1.007,2.25,2.25,2.25Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
