<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let className = "size-5";
  export let strokeWidth = 2;
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
    d="M21,15v4c0,1.105-.895,2-2,2H5c-1.105,0-2-.895-2-2v-4"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <polyline
    points="7 10 12 15 17 10"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
  <line
    x1="12"
    y1="15"
    x2="12"
    y2="3"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
  />
</svg>
