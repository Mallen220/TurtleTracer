<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
  }

  let { className = "size-5", strokeWidth = 2 }: Props = $props();
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
    d="M6.75,12c0,.414-.336.75-.75.75s-.75-.336-.75-.75.336-.75.75-.75.75.336.75.75ZM12.75,12c0,.414-.336.75-.75.75s-.75-.336-.75-.75.336-.75.75-.75.75.336.75.75ZM18.75,12c0,.414-.336.75-.75.75s-.75-.336-.75-.75.336-.75.75-.75.75.336.75.75Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
