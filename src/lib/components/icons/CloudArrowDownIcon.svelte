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
    d="M7,15.977c-2.209.002-4.002-1.786-4.004-3.996-.002-1.873,1.296-3.497,3.124-3.907-.579-2.701,1.141-5.359,3.842-5.938,2.701-.579,5.359,1.141,5.938,3.841h.1c2.761-.003,5.002,2.234,5.005,4.995.002,2.38-1.673,4.431-4.005,4.905M15,12.977l-3-3M12,9.977l-3,3M12,9.977v12"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
