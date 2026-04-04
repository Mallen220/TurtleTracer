<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
    strokeWidth?: number;
    stroke?: string;
  }

  let {
    className = "size-6",
    strokeWidth = 2,
    stroke = "currentColor",
  }: Props = $props();
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  fill="none"
  viewBox="0 0 24 24"
  stroke-width={strokeWidth}
  {stroke}
  class={className}
>
  <path
    d="M16.023,9.349h4.992M2.985,19.645v-4.992M2.985,14.653h4.992M2.984,14.653l3.181,3.183c3.222,3.222,8.445,3.222,11.667,0,1.024-1.024,1.761-2.301,2.136-3.7M4.031,9.866c1.178-4.401,5.702-7.014,10.103-5.836,1.399.375,2.676,1.111,3.7,2.136l3.181,3.182M21.015,4.357v4.99"
    stroke-linecap="round"
    stroke-linejoin="round"
  />
</svg>
