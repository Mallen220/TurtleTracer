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

<div class="w-full flex flex-col gap-4 p-4 pb-32">
  {#if result}
    <!-- Stats Section -->
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden"
    >
      <div class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
        <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            class="size-4"
            stroke-width="2"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
          </svg>
          Statistics
        </h3>
      </div>

      <div class="p-4 grid grid-cols-1 gap-4">
        <!-- Time -->
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">Total Time</span>
            <span class="text-lg font-semibold text-neutral-900 dark:text-white">{formatNum(result.statsDiff.time.new)}s</span>
          </div>
          <div class="flex flex-col items-end">
             <span class="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">Change</span>
             <span class="text-sm font-bold {result.statsDiff.time.diff > 0 ? 'text-red-500' : result.statsDiff.time.diff < 0 ? 'text-green-500' : 'text-neutral-400'}">
                {formatDiff(result.statsDiff.time.diff)}s
             </span>
          </div>
        </div>

        <div class="h-px bg-neutral-100 dark:bg-neutral-700"></div>

        <!-- Distance -->
        <div class="flex items-center justify-between">
          <div class="flex flex-col">
            <span class="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">Total Distance</span>
            <span class="text-lg font-semibold text-neutral-900 dark:text-white">{formatNum(result.statsDiff.distance.new)} in</span>
          </div>
          <div class="flex flex-col items-end">
             <span class="text-xs text-neutral-500 dark:text-neutral-400 font-medium uppercase tracking-wider">Change</span>
             <span class="text-sm font-bold {result.statsDiff.distance.diff > 0 ? 'text-neutral-600 dark:text-neutral-300' : result.statsDiff.distance.diff < 0 ? 'text-neutral-600 dark:text-neutral-300' : 'text-neutral-400'}">
                {formatDiff(result.statsDiff.distance.diff)} in
             </span>
          </div>
        </div>
      </div>
    </div>

    <!-- Events Section -->
    <div
      class="bg-white dark:bg-neutral-800 rounded-lg shadow-sm border border-neutral-200 dark:border-neutral-700 overflow-hidden"
    >
      <div class="px-4 py-3 border-b border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
        <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="size-4">
            <path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
          </svg>
          Events
        </h3>
      </div>

      <div class="p-4">
        {#if addedEvents.length === 0 && removedEvents.length === 0 && changedEvents.length === 0}
          <div class="flex flex-col items-center justify-center py-6 text-neutral-400 dark:text-neutral-500 gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" class="size-8 opacity-50">
              <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span class="text-sm">No event changes detected</span>
          </div>
        {:else}
          <div class="space-y-3">
            {#each addedEvents as item}
              <div class="flex items-start gap-3 p-2 rounded-md bg-green-50 dark:bg-green-900/10 border border-green-100 dark:border-green-900/30">
                <div class="flex-none mt-0.5">
                  <div class="w-5 h-5 rounded-full bg-green-100 dark:bg-green-800 flex items-center justify-center text-green-600 dark:text-green-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3">
                      <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">Added</p>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400 break-words">{item.description}</p>
                </div>
              </div>
            {/each}

            {#each removedEvents as item}
              <div class="flex items-start gap-3 p-2 rounded-md bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/30">
                <div class="flex-none mt-0.5">
                  <div class="w-5 h-5 rounded-full bg-red-100 dark:bg-red-800 flex items-center justify-center text-red-600 dark:text-red-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3">
                      <path fill-rule="evenodd" d="M4 10a.75.75 0 01.75-.75h10.5a.75.75 0 010 1.5H4.75A.75.75 0 014 10z" clip-rule="evenodd" />
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">Removed</p>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400 break-words">{item.description}</p>
                </div>
              </div>
            {/each}

            {#each changedEvents as item}
              <div class="flex items-start gap-3 p-2 rounded-md bg-blue-50 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30">
                <div class="flex-none mt-0.5">
                  <div class="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center text-blue-600 dark:text-blue-200">
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" class="size-3">
                      <path d="M15.98 1.804a1 1 0 00-1.96 0l-.24 1.192a1 1 0 01-.784.785l-1.192.238a1 1 0 000 1.96l1.192.238a1 1 0 01.785.785l.238 1.192a1 1 0 001.96 0l.238-1.192a1 1 0 01.785-.785l1.192-.238a1 1 0 000-1.96l-1.192-.238a1 1 0 01-.785-.785l-.238-1.192zM6.949 5.684a1 1 0 00-1.898 0l-.683 2.051a1 1 0 01-.633.633l-2.051.683a1 1 0 000 1.898l2.051.683a1 1 0 01.633.633l.683 2.051a1 1 0 001.898 0l.683-2.051a1 1 0 01.633-.633l2.051-.683a1 1 0 000-1.898l-2.051-.683a1 1 0 01-.633-.633L6.95 5.684zM13.949 13.684a1 1 0 00-1.898 0l-.184.551a1 1 0 01-.632.633l-.551.183a1 1 0 000 1.898l.551.183a1 1 0 01.633.633l.183.551a1 1 0 001.898 0l.183-.551a1 1 0 01.633-.633l.551-.183a1 1 0 000-1.898l-.551-.183a1 1 0 01-.633-.633l-.183-.551z" />
                    </svg>
                  </div>
                </div>
                <div class="flex-1 min-w-0">
                  <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">Changed</p>
                  <p class="text-xs text-neutral-500 dark:text-neutral-400 break-words">{item.description}</p>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  {:else}
    <div class="flex justify-center items-center py-12 flex-col gap-3">
       <div class="w-8 h-8 border-4 border-purple-200 border-t-purple-600 rounded-full animate-spin"></div>
       <p class="text-neutral-400 text-sm">Computing diff...</p>
    </div>
  {/if}
</div>
