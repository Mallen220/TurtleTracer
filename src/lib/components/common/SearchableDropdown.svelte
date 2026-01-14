<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { slide } from "svelte/transition";

  export let value: string = "";
  export let options: string[] = [];
  export let placeholder: string = "Search or add new...";
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher();

  let isOpen = false;
  let inputElement: HTMLInputElement;

  // Filter options based on current input
  $: filteredOptions = options
    .filter((opt) => opt.toLowerCase().includes(value.toLowerCase()))
    .sort();

  function handleInput(e: Event) {
    value = (e.target as HTMLInputElement).value;
    isOpen = true;
    dispatch("change", value);
  }

  function handleFocus() {
    isOpen = true;
  }

  function handleBlur() {
    // Small delay to allow click on dropdown item to register
    setTimeout(() => {
      isOpen = false;
    }, 200);
  }

  function selectOption(opt: string) {
    value = opt;
    isOpen = false;
    dispatch("change", value);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      isOpen = false;
      inputElement.blur();
    }
    if (e.key === "Escape") {
      isOpen = false;
      inputElement.blur();
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
  />

  {#if isOpen && filteredOptions.length > 0}
    <div
      transition:slide={{ duration: 150 }}
      class="absolute z-50 left-0 right-0 mt-1 max-h-40 overflow-y-auto bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-md shadow-lg"
    >
      {#each filteredOptions as option}
        <button
          class="w-full text-left px-3 py-1.5 text-sm hover:bg-purple-50 dark:hover:bg-purple-900/20 text-neutral-700 dark:text-neutral-200"
          on:click={() => selectOption(option)}
        >
          {option}
        </button>
      {/each}
    </div>
  {/if}
</div>
