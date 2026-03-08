<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher, tick } from "svelte";
  import { slide } from "svelte/transition";

  export let value: string = "";
  export let options: string[] = [];
  export let placeholder: string = "Search or add new...";
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();

  let isOpen = false;
  let inputElement: HTMLInputElement;
  let highlightedIndex = -1;
  let listElement: HTMLDivElement;

  // Filter options based on current input
  $: filteredOptions = options
    .filter((opt) => opt.toLowerCase().includes(value.toLowerCase()))
    .sort();

  // Reset highlight when options change
  $: if (filteredOptions) {
    highlightedIndex = -1;
  }

  function handleInput(e: Event) {
    value = (e.target as HTMLInputElement).value;
    isOpen = true;
    dispatch("change", value);
  }

  function handleFocus() {
    isOpen = true;
  }

  function handleBlur() {
    // If interaction was with an option (mousedown), that handler fires before blur
    // thanks to event order or we handle it via other means.
    // However, if we click outside, we want to close.
    // If we click an option, we want to select it.
    // Standard pattern: use a small delay OR rely on mousedown preventing default focus change?
    // Let's stick to a small delay for safety unless we use relatedTarget,
    // but relatedTarget might be null if clicking a non-focusable div.
    // The previous implementation used 200ms. I'll reduce it but keep it as a fallback,
    // but I will primarily rely on mousedown|preventDefault on the options.
    setTimeout(() => {
      isOpen = false;
      highlightedIndex = -1;
    }, 150);
  }

  function selectOption(opt: string) {
    value = opt;
    isOpen = false;
    highlightedIndex = -1;
    dispatch("change", value);
  }

  async function handleKeydown(e: KeyboardEvent) {
    if (disabled) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!isOpen) {
        isOpen = true;
        highlightedIndex = 0;
      } else {
        highlightedIndex = (highlightedIndex + 1) % filteredOptions.length;
        scrollToHighlighted();
      }
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!isOpen) {
        isOpen = true;
        highlightedIndex = filteredOptions.length - 1;
      } else {
        highlightedIndex =
          (highlightedIndex - 1 + filteredOptions.length) %
          filteredOptions.length;
        scrollToHighlighted();
      }
    } else if (e.key === "Enter") {
      if (
        isOpen &&
        highlightedIndex >= 0 &&
        filteredOptions[highlightedIndex]
      ) {
        e.preventDefault();
        selectOption(filteredOptions[highlightedIndex]);
        inputElement.blur();
      } else {
        // Just standard enter behavior (submit form?) or close?
        // If simply typing, Enter might mean "I'm done typing"
        isOpen = false;
        inputElement.blur();
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      isOpen = false;
      highlightedIndex = -1;
      inputElement.blur();
    }
  }

  async function scrollToHighlighted() {
    await tick();
    if (listElement && highlightedIndex >= 0) {
      const optionEl = listElement.children[highlightedIndex] as HTMLElement;
      if (optionEl && typeof optionEl.scrollIntoView === "function") {
        // Simple scrollIntoView or manual calculation?
        // scrollIntoView({ block: 'nearest' }) is usually good.
        optionEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    }
  }
</script>

<div class="relative w-full">
  <input
    bind:this={inputElement}
    type="text"
    bind:value
    {placeholder}
    {disabled}
    class="text-sm font-medium bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 focus:outline-none focus:ring-1 focus:ring-purple-500 rounded px-2 py-0.5 w-full"
    on:input={handleInput}
    on:focus={handleFocus}
    on:blur={handleBlur}
    on:keydown={handleKeydown}
    aria-label={placeholder}
    role="combobox"
    aria-autocomplete="list"
    aria-expanded={isOpen}
    aria-controls="dropdown-list"
    aria-activedescendant={highlightedIndex >= 0
      ? `option-${highlightedIndex}`
      : undefined}
  />

  {#if isOpen && filteredOptions.length > 0}
    <div
      bind:this={listElement}
      transition:slide={{ duration: 150 }}
      class="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg"
      role="listbox"
      id="dropdown-list"
    >
      {#each filteredOptions as option, index}
        <!-- svelte-ignore a11y-click-events-have-key-events -->
        <div
          role="option"
          tabindex="-1"
          id={`option-${index}`}
          aria-selected={index === highlightedIndex}
          class="w-full text-left px-3 py-1.5 text-sm cursor-pointer
            {index === highlightedIndex
            ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-900 dark:text-purple-100'
            : 'hover:bg-purple-50 dark:hover:bg-purple-900/20 text-neutral-700 dark:text-neutral-200'}"
          on:mousedown|preventDefault={() => selectOption(option)}
        >
          {option}
        </div>
      {/each}
    </div>
  {/if}
</div>
