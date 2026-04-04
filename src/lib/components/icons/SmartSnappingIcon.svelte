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
  <line
    x1="18.953"
    y1=".027"
    x2="18.953"
    y2="23.973"
    fill="none"
    stroke="currentColor"
    stroke-dasharray="2"
  />
  <line
    x1="1.986"
    y1="4.986"
    x2="24.042"
    y2="4.986"
    fill="none"
    stroke="currentColor"
    stroke-dasharray="2"
  />
  <circle cx="5.931" cy="17.795" r="3.638" fill="none" stroke="currentColor" />
  <line
    x1="13.87"
    y1="10.068"
    x2="8.293"
    y2="15.031"
    fill="none"
    stroke="currentColor"
  />
  <polygon
    points="14.501 9.552 10.36 10.068 14.036 12.547 14.501 9.552"
    fill="none"
    stroke="currentColor"
  />
</svg>
