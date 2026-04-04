<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  interface Props {
    className?: string;
  }

  let { className = "w-6 h-6" }: Props = $props();
</script>

<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class={className}>
  <rect x="1" y="1" width="10" height="10" fill="#f25325" />
  <rect x="13" y="1" width="10" height="10" fill="#80bc06" />
  <rect x="1" y="13" width="10" height="10" fill="#05a6f0" />
  <rect x="13" y="13" width="10" height="10" fill="#feba08" />
</svg>
