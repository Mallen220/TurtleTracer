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
  <polyline points="4 9 4 4 9 4" />
  <polyline points="15 4 20 4 20 9" />
  <polyline points="20 15 20 20 15 20" />
  <polyline points="9 20 4 20 4 15" />
</svg>
