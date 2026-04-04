<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
  }

  let { className = "size-6" }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="currentColor"
  viewBox="0 0 20 20"
  stroke="none"
  class={className}
>
  <path
    fill-rule="evenodd"
    clip-rule="evenodd"
    d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z"
  />
</svg>
