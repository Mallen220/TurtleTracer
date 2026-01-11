<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import { onMount } from "svelte";

  export let isOpen = false;
  export let commands: {
    id: string;
    label: string;
    shortcut?: string;
    action: () => void;
    category?: string;
  }[] = [];
  export let onClose: () => void;

  let searchQuery = "";
  let selectedIndex = 0;
  let inputElement: HTMLInputElement;

  $: filteredCommands = commands.filter((cmd) =>
    cmd.label.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  $: if (isOpen && inputElement) {
    // Focus input when opened
    setTimeout(() => inputElement.focus(), 50);
    selectedIndex = 0;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!isOpen) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      selectedIndex = (selectedIndex + 1) % filteredCommands.length;
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      selectedIndex =
        (selectedIndex - 1 + filteredCommands.length) % filteredCommands.length;
    } else if (event.key === "Enter") {
      event.preventDefault();
      executeCommand(filteredCommands[selectedIndex]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    }
  }

  function executeCommand(command: any) {
    if (command) {
      command.action();
      onClose();
    }
  }
</script>

<svelte:window on:keydown={handleKeyDown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    transition:fade={{ duration: 150, easing: cubicInOut }}
    class="fixed inset-0 z-[2000] flex items-start justify-center pt-[15vh] bg-black bg-opacity-60 backdrop-blur-sm"
    on:click|self={onClose}
    role="dialog"
    aria-modal="true"
  >
    <div
      transition:fly={{ duration: 200, y: -20, easing: cubicInOut }}
      class="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-700 ring-1 ring-black/5"
    >
      <div
        class="flex items-center px-5 py-4 border-b border-neutral-200 dark:border-neutral-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="2"
          stroke="currentColor"
          class="size-6 text-neutral-400 mr-4"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
          />
        </svg>
        <input
          bind:this={inputElement}
          type="text"
          bind:value={searchQuery}
          placeholder="Type a command or search..."
          class="w-full bg-transparent border-none focus:ring-0 text-xl text-neutral-900 dark:text-white placeholder-neutral-400 font-medium"
        />
      </div>

      <div class="max-h-[60vh] overflow-y-auto py-2 px-2 scrollbar-thin">
        {#if filteredCommands.length === 0}
          <div
            class="px-4 py-12 text-center text-neutral-500 dark:text-neutral-400"
          >
            <p class="text-lg font-medium">No commands found</p>
            <p class="text-sm mt-1">Try searching for something else</p>
          </div>
        {:else}
          {#each filteredCommands as command, index}
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left transition-all duration-75 rounded-lg mb-0.5
                {index === selectedIndex
                ? 'bg-indigo-600 text-white shadow-md transform scale-[1.01]'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
              on:click={() => executeCommand(command)}
              on:mousemove={() => (selectedIndex = index)}
            >
              <div class="flex items-center gap-4">
                <div class="flex flex-col">
                  <span class="text-base font-semibold">{command.label}</span>
                  {#if command.category}
                    <span
                      class="text-xs font-medium uppercase tracking-wider mt-0.5 {index === selectedIndex
                        ? 'text-indigo-200'
                        : 'text-neutral-400 dark:text-neutral-500'}"
                      >{command.category}</span
                    >
                  {/if}
                </div>
              </div>
              {#if command.shortcut}
                <div class="flex items-center gap-1">
                   {#each command.shortcut.split('+') as key}
                     <kbd class="text-xs font-mono font-bold px-1.5 py-0.5 rounded border
                       {index === selectedIndex
                         ? 'bg-indigo-500 border-indigo-400 text-indigo-100'
                         : 'bg-neutral-100 dark:bg-neutral-800 border-neutral-200 dark:border-neutral-700 text-neutral-500 dark:text-neutral-400'}">
                       {key.trim().replace('Command', 'Cmd').replace('Control', 'Ctrl')}
                     </kbd>
                   {/each}
                </div>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div
        class="px-5 py-3 bg-neutral-50 dark:bg-neutral-900/80 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 dark:text-neutral-400 flex justify-end gap-6 font-medium"
      >
        <span class="flex items-center gap-1.5"
          ><kbd
            class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded min-w-[1.5em] text-center"
            >↑</kbd
          >
          <kbd class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded min-w-[1.5em] text-center"
            >↓</kbd
          > to navigate</span
        >
        <span class="flex items-center gap-1.5"
          ><kbd
            class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded"
            >Enter</kbd
          > to select</span
        >
        <span class="flex items-center gap-1.5"
          ><kbd
            class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1.5 py-0.5 rounded"
            >Esc</kbd
          > to close</span
        >
      </div>
    </div>
  </div>
{/if}
