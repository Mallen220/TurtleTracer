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
    d="M10.29,3.912L1.82,18.052c-.552.957-.225,2.18.732,2.732.298.172.634.264.978.268h16.94c1.105-.012,1.99-.917,1.978-2.022-.004-.344-.096-.681-.268-.978L13.71,3.912c-.573-.944-1.803-1.246-2.747-.673-.275.167-.506.398-.673.673Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <line
    x1="12"
    y1="9.052"
    x2="12"
    y2="13.052"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
  <line
    x1="12"
    y1="17.052"
    x2="12.01"
    y2="17.052"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
