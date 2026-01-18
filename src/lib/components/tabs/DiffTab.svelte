<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { diffResult } from "../../diffStore";

  $: result = $diffResult;

  // Derived lists from the flat eventDiff array
  $: addedEvents = result ? result.eventDiff.filter(e => e.changeType === 'added') : [];
  $: removedEvents = result ? result.eventDiff.filter(e => e.changeType === 'removed') : [];
  $: changedEvents = result ? result.eventDiff.filter(e => e.changeType === 'changed') : [];

  function formatNum(n: number) {
    return n.toFixed(2);
  }

  function formatDiff(n: number) {
    return (n > 0 ? "+" : "") + n.toFixed(2);
  }
</script>

<div class="w-full h-full flex flex-col bg-neutral-50 dark:bg-neutral-900 overflow-y-auto">
  {#if result}
    <div class="p-4 space-y-6">
      <!-- Stats Overview -->
      <div class="grid grid-cols-2 gap-4">
        <div class="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
          <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">Total Time</p>
          <div class="flex items-baseline gap-2">
            <span class="text-2xl font-bold text-neutral-900 dark:text-white">{formatNum(result.statsDiff.time.new)}s</span>
            {#if result.statsDiff.time.diff !== 0}
                <span class="text-sm font-semibold {result.statsDiff.time.diff > 0 ? 'text-red-500' : 'text-green-500'}">
                    {formatDiff(result.statsDiff.time.diff)}s
                </span>
            {/if}
          </div>
        </div>

        <div class="bg-white dark:bg-neutral-800 p-4 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
            <p class="text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase tracking-wide mb-1">Total Distance</p>
            <div class="flex items-baseline gap-2">
              <span class="text-2xl font-bold text-neutral-900 dark:text-white">{formatNum(result.statsDiff.distance.new)} in</span>
              {#if result.statsDiff.distance.diff !== 0}
                  <span class="text-sm font-semibold text-neutral-500">
                      {formatDiff(result.statsDiff.distance.diff)} in
                  </span>
              {/if}
            </div>
        </div>
      </div>

      <!-- Events Log -->
      <div class="space-y-3">
        <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          Changes Log
          <span class="px-2 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-xs text-neutral-600 dark:text-neutral-300">
            {addedEvents.length + removedEvents.length + changedEvents.length}
          </span>
        </h3>

        {#if addedEvents.length === 0 && removedEvents.length === 0 && changedEvents.length === 0}
            <div class="p-8 text-center bg-white dark:bg-neutral-800 rounded-xl border border-neutral-200 dark:border-neutral-700 border-dashed">
                <p class="text-neutral-500 dark:text-neutral-400 text-sm">No changes detected compared to the last commit.</p>
            </div>
        {:else}
            <div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 divide-y divide-neutral-100 dark:divide-neutral-700/50 overflow-hidden">
                {#each addedEvents as item}
                    <div class="p-4 flex items-start gap-4 hover:bg-green-50/50 dark:hover:bg-green-900/10 transition-colors">
                        <div class="mt-1 flex-none w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/50 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-green-600 dark:text-green-400">
                                <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-0.5">Event Added</p>
                            <p class="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{item.description}</p>
                        </div>
                    </div>
                {/each}

                {#each removedEvents as item}
                    <div class="p-4 flex items-start gap-4 hover:bg-red-50/50 dark:hover:bg-red-900/10 transition-colors">
                        <div class="mt-1 flex-none w-6 h-6 rounded-full bg-red-100 dark:bg-red-900/50 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-red-600 dark:text-red-400">
                                <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                            </svg>
                        </div>
                        <div>
                            <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 mb-0.5">Event Removed</p>
                            <p class="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed">{item.description}</p>
                        </div>
                    </div>
                {/each}

                {#each changedEvents as item}
                    <div class="p-4 flex items-start gap-4 hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                        <div class="mt-1 flex-none w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="w-3 h-3 text-blue-600 dark:text-blue-400">
                                <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.96l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.96 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.96l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.683a1 1 0 01.633.633l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.183-.551a1 1 0 01.633-.633l.551-.183a1 1 0 000-1.898l-.551-.183a1 1 0 01-.633-.633l-.183-.551z" />
                            </svg>
                        </div>
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-2">
                                <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{item.name}</p>
                                {#if item.parentName}
                                    <span class="text-xs text-neutral-400 dark:text-neutral-500">in {item.parentName}</span>
                                {/if}
                            </div>
                            {#if item.details && item.details.length > 0}
                                <div class="grid grid-cols-[auto_1fr_auto_1fr] gap-x-3 gap-y-2 items-center text-xs">
                                    {#each item.details as detail}
                                        <span class="text-neutral-500 dark:text-neutral-400 font-medium">{detail.property}:</span>
                                        <span class="text-red-500 line-through dark:text-red-400">{detail.oldVal}</span>
                                        <span class="text-neutral-400">→</span>
                                        <span class="text-green-600 dark:text-green-400 font-medium">{detail.newVal}</span>
                                    {/each}
                                </div>
                            {:else}
                                <p class="text-xs text-neutral-500 dark:text-neutral-400">{item.description}</p>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex flex-col items-center justify-center h-full gap-4 text-center p-8">
       <div class="w-10 h-10 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
       <div>
           <p class="text-neutral-900 dark:text-white font-medium">Computing Diff</p>
           <p class="text-neutral-500 dark:text-neutral-400 text-sm">Comparing against the last committed version...</p>
       </div>
    </div>
  {/if}
</div>
