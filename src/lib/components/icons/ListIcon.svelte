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
    d="M8.438,6.75h12M8.438,12h12M8.438,17.25h12M3.938,6.75h.007v.008h-.007v-.008ZM4.312,6.75c0,.207-.168.375-.375.375s-.375-.168-.375-.375.168-.375.375-.375.375.168.375.375ZM3.938,12h.007v.008h-.007v-.008ZM4.312,12c0,.207-.168.375-.375.375s-.375-.168-.375-.375.168-.375.375-.375.375.168.375.375ZM3.938,17.25h.007v.008h-.007v-.008ZM4.312,17.25c0,.207-.168.375-.375.375s-.375-.168-.375-.375.168-.375.375-.375.375.168.375.375Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
