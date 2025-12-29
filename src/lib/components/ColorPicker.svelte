<script lang="ts">
  export let color: string;
  export let title: string = "Change Color";
  export let disabled: boolean = false;
</script>

<div
  class="relative size-5 rounded-full overflow-hidden shadow-sm border border-neutral-300 dark:border-neutral-600 shrink-0"
  style="background-color: {color}"
>
  <input
    type="color"
    bind:value={color}
    class="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
    {title}
    {disabled}
    on:input
    on:change
  />
</div>
