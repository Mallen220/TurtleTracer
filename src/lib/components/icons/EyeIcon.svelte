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
    d="M2.036,12.322c-.069-.207-.069-.432,0-.639,1.387-4.173,5.324-7.183,9.964-7.183s8.573,3.007,9.963,7.178c.07.207.07.431,0,.639-1.386,4.173-5.323,7.183-9.963,7.183s-8.573-3.007-9.963-7.178h0Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <path
    d="M15,12c0,1.657-1.343,3-3,3s-3-1.343-3-3,1.343-3,3-3,3,1.343,3,3Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
