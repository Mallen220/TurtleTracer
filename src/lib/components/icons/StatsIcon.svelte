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
    d="M9,19v-6c0-1.105-.895-2-2-2h-2c-1.105,0-2,.895-2,2v6c0,1.105.895,2,2,2h2c1.105,0,2-.895,2-2ZM9,19v-10c0-1.105.895-2,2-2h2c1.105,0,2,.895,2,2v10M9,19c0,1.105.895,2,2,2h2c1.105,0,2-.895,2-2M15,19V5c0-1.105.895-2,2-2h2c1.105,0,2,.895,2,2v14c0,1.105-.895,2-2,2h-2c-1.105,0-2-.895-2-2Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
