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
    d="M10.744,10.978c.371-.185,1.653.931,1.61,1.104l-.708,2.836c-.195,1.037,1.23,1.513,1.483.814M21,12c0,4.971-4.029,9-9,9S3,16.971,3,12,7.029,3,12,3s9,4.029,9,9ZM12,8.25h.008v.008h-.008v-.008Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
