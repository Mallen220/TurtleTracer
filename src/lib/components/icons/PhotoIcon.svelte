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
    d="M4,16l4.586-4.586c.781-.781,2.047-.781,2.828,0l4.586,4.586M14,14l1.586-1.586c.781-.781,2.047-.781,2.828,0l1.586,1.586M14,8h.01M6,20h12c1.105,0,2-.895,2-2V6c0-1.105-.895-2-2-2H6c-1.105,0-2,.895-2,2v12c0,1.105.895,2,2,2Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
