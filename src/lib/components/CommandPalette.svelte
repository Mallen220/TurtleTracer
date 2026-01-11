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
    class="fixed inset-0 z-[2000] flex items-start justify-center pt-[20vh] bg-black bg-opacity-50 backdrop-blur-sm"
    on:click|self={onClose}
    role="dialog"
    aria-modal="true"
  >
    <div
      transition:fly={{ duration: 200, y: -20, easing: cubicInOut }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-700"
    >
      <div
        class="flex items-center px-4 py-3 border-b border-neutral-200 dark:border-neutral-700"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke-width="1.5"
          stroke="currentColor"
          class="size-5 text-neutral-400 mr-3"
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
          class="w-full bg-transparent border-none focus:ring-0 text-lg text-neutral-900 dark:text-white placeholder-neutral-400"
        />
      </div>

      <div class="max-h-[60vh] overflow-y-auto py-2">
        {#if filteredCommands.length === 0}
          <div
            class="px-4 py-8 text-center text-neutral-500 dark:text-neutral-400"
          >
            No commands found.
          </div>
        {:else}
          {#each filteredCommands as command, index}
            <button
              class="w-full px-4 py-2 flex items-center justify-between text-left transition-colors
                {index === selectedIndex
                ? 'bg-indigo-600 text-white'
                : 'text-neutral-700 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-800'}"
              on:click={() => executeCommand(command)}
              on:mousemove={() => (selectedIndex = index)}
            >
              <div class="flex items-center gap-3">
                <!-- Optional Icon placeholder could go here -->
                <div>
                  <span class="font-medium block">{command.label}</span>
                  {#if command.category}
                    <span
                      class="text-xs opacity-70 {index === selectedIndex
                        ? 'text-indigo-200'
                        : 'text-neutral-500 dark:text-neutral-500'}"
                      >{command.category}</span
                    >
                  {/if}
                </div>
              </div>
              {#if command.shortcut}
                <span
                  class="text-xs font-mono opacity-80 {index === selectedIndex
                    ? 'text-indigo-100'
                    : 'text-neutral-500 dark:text-neutral-400'}"
                >
                  {command.shortcut}
                </span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <div
        class="px-4 py-2 bg-neutral-50 dark:bg-neutral-900/50 border-t border-neutral-200 dark:border-neutral-800 text-xs text-neutral-500 flex justify-between"
      >
        <span
          ><kbd
            class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1 rounded"
            >↑</kbd
          >
          <kbd class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1 rounded"
            >↓</kbd
          > to navigate</span
        >
        <span
          ><kbd
            class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1 rounded"
            >Enter</kbd
          > to select</span
        >
        <span
          ><kbd
            class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1 rounded"
            >Esc</kbd
          > to close</span
        >
      </div>
    </div>
  </div>
{/if}
