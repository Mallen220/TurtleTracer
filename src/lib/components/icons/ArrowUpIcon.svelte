<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let className = "size-6";
  export let width = "24";
  export let height = "24";
  export let style = "";
</script>

<svg
  {style}
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke="#16a34a"
  stroke-width="3"
  stroke-linecap="round"
  stroke-linejoin="round"
  class={className}
  {width}
  {height}
>
  <line x1="12" y1="19" x2="12" y2="5"></line>
  <polyline points="5 12 12 5 19 12"></polyline>
</svg>
