<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let className = "size-6";
  export let strokeWidth = 2;
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
    d="M0,9.334h8.722c1.105,0,2,.895,2,2v12.666"
    fill="none"
    stroke="currentColor"
  />
  <circle cx="19.222" cy="5.355" r="3" fill="none" stroke="currentColor" />
  <circle
    cx="4.722"
    cy="14.994"
    r="3"
    fill="none"
    stroke="currentColor"
    stroke-dasharray="2"
  />
  <g>
    <path
      d="M19.222,8.355c.256,3.784,3.13,6.158-4.215,6.574"
      fill="none"
      stroke="currentColor"
    />
    <path
      d="M12.352,14.994c1.233-.506,2.756-1.349,3.688-2.219l-.686,2.117.827,2.065c-.989-.805-2.565-1.543-3.83-1.964Z"
    />
  </g>
</svg>
