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
  <path
    stroke-linecap="round"
    stroke-linejoin="round"
    d="M15 9l6 6m0 0-6 6m6-6H9a6 6 0 1 1 0-12h3"
  />
</svg>
