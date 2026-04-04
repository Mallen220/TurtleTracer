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
  stroke-linecap="round"
  stroke-linejoin="round"
  stroke="currentColor"
  class={className}
>
  <path
    d="M10.5,6h9.75M10.5,6c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5M10.5,6c0-.828-.672-1.5-1.5-1.5s-1.5.672-1.5,1.5M3.75,6h3.75M10.5,18h9.75M10.5,18c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5M10.5,18c0-.828-.672-1.5-1.5-1.5s-1.5.672-1.5,1.5M3.75,18h3.75M16.5,12h3.75M16.5,12c0,.828-.672,1.5-1.5,1.5s-1.5-.672-1.5-1.5M16.5,12c0-.828-.672-1.5-1.5-1.5s-1.5.672-1.5,1.5M3.75,12h9.75"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
