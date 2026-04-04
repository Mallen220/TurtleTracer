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
  <path
    d="M3,3.75h14.25M3,8.25h9.75M3,12.75h9.75M17.25,8.25v12M17.25,20.25l-3.75-3.75M17.25,20.25l3.75-3.75"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
