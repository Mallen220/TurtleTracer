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
    d="M14.74,9l-.346,9M9.606,18l-.346-9M19.228,5.79c.342.052.682.107,1.022.166M19.228,5.791l-1.068,13.882c-.09,1.172-1.068,2.077-2.244,2.077h-7.832c-1.176,0-2.154-.905-2.244-2.077l-1.068-13.883M19.228,5.79c-1.154-.174-2.314-.307-3.478-.397M3.75,5.955c.34-.059.68-.114,1.022-.165M4.772,5.79c1.154-.174,2.314-.307,3.478-.397M15.75,5.393v-.916c0-1.18-.91-2.164-2.09-2.201-1.106-.035-2.214-.035-3.32,0-1.18.037-2.09,1.022-2.09,2.201v.916M15.75,5.393c-2.496-.193-5.004-.193-7.5,0"
    fill="none"
    stroke="currentColor"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
