<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let className: string = "size-5";
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
  <rect
    x="3"
    y="4"
    width="18"
    height="16"
    rx="2"
    ry="2"
    fill="none"
    stroke="currentColor"
  />
  <line x1="3" y1="12" x2="21" y2="12" fill="none" stroke="currentColor" />
</svg>
