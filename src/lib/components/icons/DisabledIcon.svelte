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
    d="M12,2.25C6.615,2.25,2.25,6.615,2.25,12s4.365,9.75,9.75,9.75,9.75-4.365,9.75-9.75S17.385,2.25,12,2.25ZM7.5,12c0-.414.336-.75.75-.75h7.5c.414,0,.75.336.75.75s-.336.75-.75.75h-7.5c-.414,0-.75-.336-.75-.75Z"
    fill-rule="evenodd"
  />
</svg>
