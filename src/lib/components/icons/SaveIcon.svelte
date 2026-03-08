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
  <!-- SD card outline with slanted top-right corner -->
  <path
    stroke-linecap="round"
    stroke-linejoin="round"
    d="M21 8.5 16.5 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11A2.5 2.5 0 0 0 20 17.5V8.5z"
  />

  <!-- Contact pads (filled) -->
  <rect x="7" y="4.8" width="1.6" height="1.6" rx="0.3" fill="currentColor" />
  <rect x="9.2" y="4.8" width="1.6" height="1.6" rx="0.3" fill="currentColor" />
  <rect
    x="11.4"
    y="4.8"
    width="1.6"
    height="1.6"
    rx="0.3"
    fill="currentColor"
  />
</svg>
