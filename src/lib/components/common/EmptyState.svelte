<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  export let title: string;
  export let description: string;
  export let compact = false;
</script>

<div
  class="flex flex-col items-center justify-center text-center border-2 border-dashed border-neutral-200 dark:border-neutral-700 rounded-xl bg-neutral-50/50 dark:bg-neutral-900/50 {compact
    ? 'py-6 px-4'
    : 'py-12 px-4'}"
>
  <div
    class="bg-neutral-100 dark:bg-neutral-800 rounded-full mb-3 flex items-center justify-center {compact
      ? 'p-2'
      : 'p-3'}"
  >
    <slot name="icon">
      <!-- Default Icon -->
      <svg
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        stroke-width="1.5"
        stroke="currentColor"
        class="size-6 text-neutral-400"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z"
        />
      </svg>
    </slot>
  </div>
  <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
    {title}
  </h3>
  <p
    class="text-sm text-neutral-500 dark:text-neutral-400 mt-1 max-w-xs mx-auto"
  >
    {description}
  </p>
  <div class="mt-4 empty:hidden">
    <slot name="action" />
  </div>
</div>
