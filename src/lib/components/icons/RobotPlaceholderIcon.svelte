<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
  }

  let { className = "", strokeWidth = 2 }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  class={className}
  stroke-width={strokeWidth}
>
  <rect
    x="1"
    y="1"
    width="22"
    height="22"
    rx="4"
    ry="4"
    fill="none"
    stroke="#16a34a"
  />
  <polygon
    points="17.755 3.835 15.71 7.674 19.8 7.674 17.755 3.835"
    fill="#16a34a"
  />
  <polygon
    points="17.755 16.326 15.71 20.165 19.8 20.165 17.755 16.326"
    fill="#16a34a"
  />
  <polygon
    points="6.245 16.326 8.29 20.165 4.2 20.165 6.245 16.326"
    fill="#16a34a"
  />
  <polygon
    points="6.245 3.835 8.29 7.674 4.2 7.674 6.245 3.835"
    fill="#16a34a"
  />
</svg>
