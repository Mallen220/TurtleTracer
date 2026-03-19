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
  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
  <line x1="3" y1="9" x2="21" y2="9" />
  <line x1="3" y1="15" x2="21" y2="15" />
  <line x1="9" y1="3" x2="9" y2="21" />
  <line x1="15" y1="3" x2="15" y2="21" />
</svg>
