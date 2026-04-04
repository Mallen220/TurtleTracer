<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
    isActive?: boolean;
  }

  let {
    className = "size-4",
    strokeWidth = 2,
    isActive = false,
  }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width={strokeWidth}
  stroke="currentColor"
  class={className}
  data-active={isActive}
>
  <path
    d="M12,2.27c.74,5.432,9.304,3.032,9.837,10.963s-9.53,8.497-9.53,8.497"
    stroke-linecap="round"
    stroke="currentColor"
    stroke-miterlimit="10"
    fill="none"
  />
  <path
    d="M12,2.27c-.74,5.432-9.304,3.032-9.837,10.963-.533,7.931,9.53,8.497,9.53,8.497"
    stroke="currentColor"
    stroke-miterlimit="10"
    fill="none"
  />
  <path
    d="M12,2.27c-.74,5.432-2.284,3.032-2.817,10.963-.533,7.931,2.51,8.497,2.51,8.497h.614s3.043-.566,2.51-8.497-2.077-5.532-2.817-10.963"
    stroke-linecap="round"
    stroke="currentColor"
    stroke-miterlimit="10"
    opacity=".44"
  />
  <line
    x1="12.307"
    y1="21.73"
    x2="11.693"
    y2="21.73"
    stroke-linecap="round"
    stroke="currentColor"
    stroke-miterlimit="10"
    fill="none"
  />
</svg>
