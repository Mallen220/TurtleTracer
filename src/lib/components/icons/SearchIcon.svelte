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
    d="M21,21l-5.197-5.197M15.803,15.803c2.929-2.929,2.929-7.678,0-10.607-2.929-2.929-7.678-2.929-10.607,0-2.929,2.929-2.929,7.678,0,10.607,2.929,2.929,7.678,2.929,10.607,0Z"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
