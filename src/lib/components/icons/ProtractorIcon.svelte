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
  <style>
    .cls-2 {
      stroke-dasharray: 2.08 3.119;
    }
  </style>
  <g id="Layer_1-2" data-name="Layer 1">
    <path
      class="cls-1"
      d="M1,10.93C1,5.446,5.446,1,10.93,1s9.93,4.446,9.93,9.93"
    />
    <path
      class="cls-1"
      d="M10.93,4.773c3.337,0,5.982,2.236,5.982,4.993H4.887c0-2.758,2.705-4.993,6.043-4.993Z"
    />
    <polyline
      class="cls-1"
      points="1 10.93 1 15.094 20.859 15.094 20.859 10.93"
    />
    <line class="cls-2" x1="3.903" y1="13.261" x2="18.136" y2="13.261" />
  </g>
</svg>
