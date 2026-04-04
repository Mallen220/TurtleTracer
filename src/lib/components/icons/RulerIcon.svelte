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
    d="M21.298,15.298c.939.936.942,2.455.006,3.394-.002.002-.004.004-.006.006l-2.6,2.6c-.936.939-2.455.942-3.394.006-.002-.002-.004-.004-.006-.006L2.698,8.698c-.936-.94-.936-2.46,0-3.4l2.6-2.6c.94-.936,2.46-.936,3.4,0l12.6,12.6Z"
    fill="none"
    stroke="currentColor"
  />
  <path d="M14.498,12.498l2-2" />
  <path d="M11.498,9.498l2-2" />
  <path d="M8.498,6.498l2-2" />
  <path d="M17.498,15.498l2-2" />
</svg>
