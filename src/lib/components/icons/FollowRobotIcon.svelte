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
    d="M2.531,20.728S1.909,5.108,10,4.672s-2.178,14.656,2.8,13.256,9.887-5.04,7.2-13.256"
    fill="none"
    stroke="currentColor"
    stroke-dasharray="2"
  />
  <path
    d="M10,4.672c8.091-.436-2.178,14.656,2.8,13.256"
    fill="none"
    stroke="currentColor"
  />
</svg>
