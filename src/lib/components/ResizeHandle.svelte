<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!-- The draggable bar between the field and the control tab. -->
<script lang="ts">
  interface Props {
    /** "horizontal" sits beside the field and drags sideways; "vertical" sits below it. */
    direction: "horizontal" | "vertical";
    onstart: () => void;
    onkeydown: (e: KeyboardEvent) => void;
    onreset: () => void;
  }

  let { direction, onstart, onkeydown, onreset }: Props = $props();

  const horizontal = $derived(direction === "horizontal");
</script>

<button
  class="group flex justify-center items-center hover:bg-purple-500/10 active:bg-purple-500/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 transition-colors select-none z-40 border-none bg-neutral-200 dark:bg-neutral-800 p-0 m-0 border-neutral-300 dark:border-neutral-700 {horizontal
    ? 'w-4 cursor-col-resize border-l border-r'
    : 'h-3 w-full cursor-row-resize border-t border-b touch-none'}"
  onmousedown={onstart}
  ontouchstart={horizontal
    ? undefined
    : (e) => {
        e.preventDefault();
        onstart();
      }}
  {onkeydown}
  ondblclick={onreset}
  aria-label={horizontal ? "Resize Sidebar" : "Resize Tab"}
  title="Drag to resize. Double-click to reset. Use Arrow keys to adjust {horizontal
    ? 'width'
    : 'height'}."
>
  <div
    class="bg-neutral-400 dark:bg-neutral-600 group-hover:bg-purple-500 dark:group-hover:bg-purple-400 group-focus-visible:bg-purple-500 dark:group-focus-visible:bg-purple-400 transition-colors rounded-full {horizontal
      ? 'w-0.5 h-8'
      : 'h-1 w-8'}"
  ></div>
</button>
