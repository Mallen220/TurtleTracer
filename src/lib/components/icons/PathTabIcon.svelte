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
  <circle
    cx="3.528"
    cy="18.6"
    r="1.8"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
  <circle
    cx="7.128"
    cy="5.8"
    r="1.8"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
  <circle
    cx="13.608"
    cy="15.512"
    r="1.8"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
  <circle
    cx="18.647"
    cy="4"
    r="1.8"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
  <path
    d="M3.528,18.6s.044-11.331,3.6-12.8,2.247,10.225,6.48,9.712,5.039-11.512,5.039-11.512"
    stroke-linecap="round"
    fill="none"
    stroke="currentColor"
    stroke-miterlimit="10"
  />
</svg>
