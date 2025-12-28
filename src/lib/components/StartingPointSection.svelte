<script lang="ts">
  export let startPoint: Point;
  export let addPathAtStart: () => void;
  export let addWaitAtStart: () => void;
  export let toggleCollapseAll: () => void;
  export let allCollapsed: boolean;
</script>

<div class="flex flex-col w-full justify-start items-start gap-0.5">
  <div class="flex items-center justify-between w-full flex-wrap gap-2">
    <div class="font-semibold flex items-center gap-2">
      Starting Point
      <button
        title={startPoint.locked
          ? "Unlock Starting Point"
          : "Lock Starting Point"}
        on:click|stopPropagation={() => {
          startPoint.locked = !startPoint.locked;
          startPoint = { ...startPoint }; // Force reactivity
        }}
        class="p-1 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
      >
        {#if startPoint.locked}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-yellow-500"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {:else}
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            stroke-width={2}
            stroke="currentColor"
            class="size-5 stroke-gray-400"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z"
            />
          </svg>
        {/if}
      </button>
    </div>

    <button
      on:click={toggleCollapseAll}
      class="text-sm px-2 py-1 rounded bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-200 dark:border-neutral-700"
      aria-label="Toggle collapse/expand all"
    >
      {#if allCollapsed}
        <span class="whitespace-nowrap">Expand All</span>
      {:else}
        <span class="whitespace-nowrap">Collapse All</span>
      {/if}
    </button>
  </div>
  <div class="flex flex-wrap justify-start items-center gap-x-4 gap-y-2">
    <div class="flex items-center gap-2">
      <span class="font-extralight">X:</span>
      <input
        bind:value={startPoint.x}
        min="0"
        max="144"
        type="number"
        class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-20 sm:w-28 dark:bg-neutral-950 dark:border-neutral-700"
        step="0.1"
        disabled={startPoint.locked}
      />
      <span class="font-extralight">Y:</span>
      <input
        bind:value={startPoint.y}
        min="0"
        max="144"
        type="number"
        class="pl-1.5 rounded-md bg-neutral-100 border-[0.5px] focus:outline-none w-20 sm:w-28 dark:bg-neutral-950 dark:border-neutral-700"
        step="0.1"
        disabled={startPoint.locked}
      />
    </div>
    <div class="flex items-center gap-4">
      <button
        on:click={addPathAtStart}
        class="font-semibold text-green-500 text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width={2}
          stroke="currentColor"
          class="size-5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        <span>Add Path</span>
      </button>
      <button
        on:click={addWaitAtStart}
        class="font-semibold text-amber-500 text-sm flex flex-row justify-start items-center gap-1"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          class="size-5"
        >
          <circle cx="12" cy="12" r="9" />
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M12 7v5l3 2"
          />
        </svg>
        <span>Add Wait</span>
      </button>
    </div>
  </div>
</div>
