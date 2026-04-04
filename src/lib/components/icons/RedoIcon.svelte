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
    d="M15,9l6,6M21,15l-6,6M21,15h-12c-3.314,0-6-2.686-6-6s2.686-6,6-6h3"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
