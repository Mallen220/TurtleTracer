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
    d="M9.401,4.126c1.155-2,4.043-2,5.197,0l7.355,12.748c1.154,2-.29,4.5-2.599,4.5H4.645c-2.309,0-3.752-2.5-2.598-4.5l7.353-12.748h.001ZM12,9.373c.414,0,.75.336.75.75v3.75c0,.414-.336.75-.75.75s-.75-.336-.75-.75v-3.75c0-.414.336-.75.75-.75ZM12,17.623c.414,0,.75-.336.75-.75s-.336-.75-.75-.75-.75.336-.75.75.336.75.75.75Z"
    fill-rule="evenodd"
  />
</svg>
