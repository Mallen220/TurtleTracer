<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let className = "size-6";
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
  <path d="M12,8v-4h-4" />
  <rect
    x="4"
    y="8"
    width="16"
    height="12"
    rx="2"
    ry="2"
    fill="none"
    stroke="currentColor"
  />
  <path d="M2,14h2" />
  <path d="M20,14h2" />
  <path d="M15,13v2" />
  <path d="M9,13v2" />
</svg>
