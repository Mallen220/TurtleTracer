<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let color: string;
  export let title: string = "Change Color";
  export let disabled: boolean = false;
  // Explicitly export tabindex to allow parent to control focusability
  export let tabindex: number | undefined = undefined;
</script>

<div
  class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0 focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-indigo-500 dark:focus-within:ring-offset-neutral-900"
  style="background-color: {color}"
>
  <input
    type="color"
    bind:value={color}
    class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
    {title}
    aria-label={title}
    {disabled}
    {tabindex}
    on:input
    on:change
  />
</div>
