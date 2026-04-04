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
    d="M12,1.5c-2.899,0-5.25,2.351-5.25,5.25v3c-1.657,0-3,1.343-3,3v6.75c0,1.657,1.343,3,3,3h10.5c1.657,0,3-1.343,3-3v-6.75c0-1.657-1.343-3-3-3v-3c0-2.9-2.35-5.25-5.25-5.25Z"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
    fill-rule="evenodd"
  />
  <line
    x1="6.75"
    y1="9.75"
    x2="17.25"
    y2="9.75"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
</svg>
