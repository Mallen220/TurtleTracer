<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
  }

  let { className = "size-5" }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="currentColor"
  viewBox="0 0 24 24"
  stroke="none"
  class={className}
>
  <path
    d="M2.25,12C2.25,6.615,6.615,2.25,12,2.25s9.75,4.365,9.75,9.75-4.365,9.75-9.75,9.75S2.25,17.385,2.25,12ZM12,8.25c.414,0,.75.336.75.75v3.75c0,.414-.336.75-.75.75s-.75-.336-.75-.75v-3.75c0-.414.336-.75.75-.75ZM12,16.5c.414,0,.75-.336.75-.75s-.336-.75-.75-.75-.75.336-.75.75.336.75.75.75Z"
    fill-rule="evenodd"
  />
</svg>
