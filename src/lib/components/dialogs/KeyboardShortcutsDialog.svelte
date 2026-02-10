<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade, fly } from "svelte/transition";
  import { cubicInOut } from "svelte/easing";
  import type { Settings } from "../../../types/index";
  import { DEFAULT_KEY_BINDINGS } from "../../../config/keybindings";
  import { notification } from "../../../stores";

  export let isOpen = false;
  export let settings: Settings;

  let searchQuery = "";
  let recordingKeyFor: string | null = null;
  let selectedCategory: string = "All";

  // Use settings keyBindings if available, otherwise default
  $: keyBindings = settings?.keyBindings || DEFAULT_KEY_BINDINGS;

  // Extract unique categories
  $: categories = [
    "All",
    ...new Set(keyBindings.map((b) => b.category || "Uncategorized")),
  ];

  // Filter bindings based on search and category
  $: filteredBindings = keyBindings.filter((binding) => {
    const matchesSearch =
      binding.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      binding.key.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "All" ||
      (binding.category || "Uncategorized") === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Group filtered bindings by category for display when "All" is selected
  $: groupedBindings =
    selectedCategory === "All"
      ? categories
          .filter((c) => c !== "All")
          .map((category) => ({
            category,
            bindings: filteredBindings.filter(
              (b) => (b.category || "Uncategorized") === category,
            ),
          }))
          .filter((group) => group.bindings.length > 0)
      : [
          {
            category: selectedCategory,
            bindings: filteredBindings,
          },
        ];

  // Detect duplicate keys (case-insensitive) and expose a mapping for UI warnings
  let duplicateCheckVersion = 0;
  let duplicateMap: Record<string, (typeof keyBindings)[number][] | undefined> =
    {};

  // Whitelisted duplicate sets that are acceptable and should NOT generate warnings
  const ALLOWED_DUPLICATE_SETS: Set<string>[] = [
    // It's intentional for `Escape` to both cancel dialogs and deselect all
    new Set(["cancel-dialog", "deselect-all"]),
  ];

  function isAllowedDuplicateSet(
    arr: (typeof keyBindings)[number][] | undefined,
  ): boolean {
    if (!arr || arr.length === 0) return false;
    const ids = new Set(arr.map((b) => b.id));
    return ALLOWED_DUPLICATE_SETS.some((allowed) => {
      if (allowed.size !== ids.size) return false;
      for (const id of allowed) {
        if (!ids.has(id)) return false;
      }
      return true;
    });
  }

  $: {
    // include duplicateCheckVersion to force recomputation when a manual reset occurs
    const _dup = duplicateCheckVersion;
    duplicateMap = (keyBindings || []).reduce(
      (acc, b) => {
        const keyString = (b.key || "").toLowerCase();
        if (!keyString) return acc;

        // Split by comma to handle multiple keys per binding
        const keys = keyString
          .split(",")
          .map((k) => k.trim())
          .filter((k) => k !== "");

        keys.forEach((k) => {
          (acc[k] = acc[k] || []).push(b);
        });

        return acc;
      },
      {} as Record<string, (typeof keyBindings)[number][] | undefined>,
    );
  }

  // Exclude allowed duplicate groups from warning list
  $: duplicateKeys = Object.entries(duplicateMap).filter(([_, arr]) => {
    if (!arr || arr.length <= 1) return false;
    if (isAllowedDuplicateSet(arr)) return false;
    return true;
  }) as [string, (typeof keyBindings)[number][]][];

  function getConflicts(binding: (typeof keyBindings)[number]) {
    if (!binding.key) return [];
    const keys = binding.key
      .toLowerCase()
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k);
    const conflicts = new Set<(typeof keyBindings)[number]>();

    keys.forEach((k) => {
      const dups = duplicateMap[k];
      if (dups && dups.length > 1) {
        // If this particular set of duplicates is whitelisted, ignore it
        if (isAllowedDuplicateSet(dups)) return;
        dups.forEach((d) => {
          if (d.id !== binding.id) conflicts.add(d);
        });
      }
    });

    return Array.from(conflicts);
  }

  function startRecordingKey(actionId: string) {
    recordingKeyFor = actionId;
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (!isOpen) return;

    // Close on Escape if not recording
    if (event.key === "Escape" && !recordingKeyFor) {
      isOpen = false;
      return;
    }

    if (recordingKeyFor) {
      handleRecordingKeyDown(event);
    }
  }

  function handleRecordingKeyDown(event: KeyboardEvent) {
    // Ensure keyBindings exists in settings and is a copy before trying to modify it
    if (
      !settings.keyBindings ||
      settings.keyBindings === DEFAULT_KEY_BINDINGS
    ) {
      settings.keyBindings = (settings.keyBindings || DEFAULT_KEY_BINDINGS).map(
        (b) => ({ ...b }),
      );
    }

    const bindingIndex = settings.keyBindings.findIndex(
      (b) => b.id === recordingKeyFor,
    );

    if (bindingIndex === -1) {
      recordingKeyFor = null;
      return;
    }
    const binding = settings.keyBindings[bindingIndex];

    event.preventDefault();
    event.stopPropagation();

    // If Escape is pressed, set binding to unbound ("") and stop recording
    if (event.key === "Escape") {
      settings.keyBindings[bindingIndex].key = "";
      settings = { ...settings }; // Force reactivity
      recordingKeyFor = null;
      return;
    }

    // Check if the key pressed is a modifier key (ignore if it is)
    const modifierKeys = ["Control", "Alt", "Shift", "Meta", "Command"];
    if (modifierKeys.includes(event.key)) {
      return; // Wait for a non-modifier key to be pressed
    }

    // Build the key string
    let key = "";
    if (event.ctrlKey) key += "ctrl+";
    if (event.altKey) key += "alt+";
    if (event.shiftKey) key += "shift+";
    if (event.metaKey) key += "cmd+";

    // Handle special keys or regular keys
    let code = event.code.toLowerCase();
    let keyName = event.key.toLowerCase();

    // Map common keys to hotkeys-js format if needed
    if (code.startsWith("key")) {
      key += keyName;
    } else if (code.startsWith("digit")) {
      key += keyName;
    } else if (keyName === " ") {
      key += "space";
    } else {
      key += keyName;
    }

    // Update the binding
    settings.keyBindings![bindingIndex].key = key;
    settings = { ...settings }; // Force reactivity
    recordingKeyFor = null;
  }

  function resetBinding(id: string) {
    const defaultBinding = DEFAULT_KEY_BINDINGS.find((b) => b.id === id);
    const bindingIndex = settings.keyBindings?.findIndex((b) => b.id === id);

    // If there's a default, prefer that
    if (defaultBinding) {
      if (bindingIndex !== undefined && bindingIndex !== -1) {
        settings.keyBindings![bindingIndex].key = defaultBinding.key;
      } else {
        // If the binding wasn't present in user settings, add the default back
        settings.keyBindings = [
          ...(settings.keyBindings || []),
          { ...defaultBinding },
        ];
      }
      settings = { ...settings };
      return;
    }

    // Fallback: if no default exists but binding exists in settings, clear it
    if (bindingIndex !== undefined && bindingIndex !== -1) {
      settings.keyBindings![bindingIndex].key = "";
      settings = { ...settings };
    }
  }

  /**
   * Reset all key bindings to their defaults (with confirmation)
   */
  function resetAllBindings() {
    if (
      !confirm(
        "Reset all key bindings to defaults? This will overwrite any custom key bindings.",
      )
    )
      return;
    const previousBindings = (settings.keyBindings || []).map((b) => ({
      ...b,
    }));

    settings.keyBindings = DEFAULT_KEY_BINDINGS.map((b) => ({ ...b }));
    settings = { ...settings };
    // Clear any active recording and inform the user
    recordingKeyFor = null;
    // Force re-evaluate duplicate detection
    duplicateCheckVersion = (duplicateCheckVersion || 0) + 1;

    // Provide an "Undo" action in the notification which restores the previous bindings
    notification.set({
      message: "Reset key bindings to defaults",
      type: "success",
      timeout: 5000,
      actionLabel: "Undo",
      action: () => {
        settings.keyBindings = previousBindings.map((b) => ({ ...b }));
        settings = { ...settings };
        duplicateCheckVersion = (duplicateCheckVersion || 0) + 1;
        notification.set({
          message: "Restored key bindings",
          type: "success",
          timeout: 3000,
        });
      },
    });
  }

  function isModified(binding: any) {
    const defaultBinding = DEFAULT_KEY_BINDINGS.find(
      (b) => b.id === binding.id,
    );
    return defaultBinding && binding.key !== defaultBinding.key;
  }
</script>

<svelte:window on:keydown|capture={handleKeyDown} />

{#if isOpen}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
  <div
    transition:fade={{ duration: 200, easing: cubicInOut }}
    class="fixed inset-0 z-[1006] flex items-center justify-center bg-black bg-opacity-50 backdrop-blur-sm"
    role="presentation"
    on:click|self={() => (isOpen = false)}
  >
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="shortcuts-title"
      transition:fly={{ duration: 300, y: 20, easing: cubicInOut }}
      class="bg-white dark:bg-neutral-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden flex flex-col border border-neutral-200 dark:border-neutral-800"
    >
      <!-- Header -->
      <div
        class="flex flex-col gap-4 px-6 py-4 border-b border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900/50"
      >
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div
              class="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600 dark:text-indigo-400"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke-width="2"
                stroke="currentColor"
                class="size-6"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18"
                />
              </svg>
            </div>
            <div>
              <h2
                id="shortcuts-title"
                class="text-xl font-bold text-neutral-900 dark:text-white"
              >
                Keyboard Shortcuts
              </h2>
              <p class="text-sm text-neutral-500 dark:text-neutral-400">
                Customize key bindings to speed up your workflow
              </p>
            </div>
          </div>
          <button
            on:click={() => (isOpen = false)}
            class="p-2 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500 dark:text-neutral-400 transition-colors"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="2"
              stroke="currentColor"
              class="size-6"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M6 18 18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="flex gap-4">
          <!-- Search -->
          <div class="relative flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-neutral-400"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"
              />
            </svg>
            <input
              type="text"
              bind:value={searchQuery}
              placeholder="Search shortcuts..."
              class="w-full pl-10 pr-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <!-- Category Filter -->
          <select
            bind:value={selectedCategory}
            class="px-4 py-2 rounded-lg border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          >
            {#each categories as category}
              <option value={category}>{category}</option>
            {/each}
          </select>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto p-6 bg-white dark:bg-neutral-900">
        {#if filteredBindings.length === 0}
          <div
            class="flex flex-col items-center justify-center h-full text-neutral-500 dark:text-neutral-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-12 mb-2 opacity-50"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
              />
            </svg>
            <p>No shortcuts found matching your search.</p>
          </div>
        {:else}
          {#if duplicateKeys.length > 0}
            <div
              class="mb-4 p-3 rounded bg-amber-100 dark:bg-amber-900/20 text-sm text-amber-800"
            >
              <strong class="mr-2">⚠️ Duplicate keybindings detected:</strong>
              {#each duplicateKeys as [k, arr], idx}
                <span class="font-medium">{k}</span>
                <span> — {arr.map((b) => b.description).join(", ")}</span>{idx <
                duplicateKeys.length - 1
                  ? ", "
                  : ""}
              {/each}
            </div>
          {/if}
          {#each groupedBindings as group}
            <div class="mb-8 last:mb-0">
              <h3
                class="text-sm font-bold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider mb-4 px-2"
              >
                {group.category}
              </h3>
              <div class="space-y-2">
                {#each group.bindings as binding}
                  <div
                    class={"flex items-center justify-between p-3 rounded-lg hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors border border-transparent hover:border-neutral-200 dark:hover:border-neutral-800 " +
                      (recordingKeyFor === binding.id
                        ? "bg-blue-50 dark:bg-blue-900/20"
                        : "")}
                  >
                    <div class="flex items-center gap-2">
                      <span
                        class="font-medium text-neutral-700 dark:text-neutral-300"
                      >
                        {binding.description}
                      </span>

                      {#if getConflicts(binding).length > 0}
                        <span
                          class="text-xs text-red-600 dark:text-red-300 px-2 py-0.5 rounded bg-red-50 dark:bg-red-900/20"
                        >
                          Conflicts with: {getConflicts(binding)
                            .map((b) => b.description)
                            .join(", ")}
                        </span>
                      {/if}
                    </div>
                    <div class="flex items-center gap-3">
                      {#if isModified(binding)}
                        <button
                          on:click={() => resetBinding(binding.id)}
                          class="text-xs text-neutral-400 hover:text-red-500 transition-colors"
                          title="Reset to default"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke-width="2"
                            stroke="currentColor"
                            class="size-4"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              d="M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3"
                            />
                          </svg>
                        </button>
                      {/if}

                      <button
                        class="px-3 py-1.5 min-w-[6rem] text-sm font-mono font-bold rounded-md shadow-sm border transition-all duration-200 text-center relative group"
                        class:bg-indigo-100={recordingKeyFor === binding.id}
                        class:text-indigo-700={recordingKeyFor === binding.id}
                        class:border-indigo-300={recordingKeyFor === binding.id}
                        class:ring-2={recordingKeyFor === binding.id}
                        class:ring-indigo-500={recordingKeyFor === binding.id}
                        class:bg-white={recordingKeyFor !== binding.id}
                        class:text-neutral-700={recordingKeyFor !==
                          binding.id && binding.key}
                        class:text-neutral-400={recordingKeyFor !==
                          binding.id && !binding.key}
                        class:italic={!binding.key &&
                          recordingKeyFor !== binding.id}
                        class:border-neutral-200={recordingKeyFor !==
                          binding.id}
                        class:dark:bg-indigo-900={recordingKeyFor ===
                          binding.id}
                        class:dark:text-indigo-100={recordingKeyFor ===
                          binding.id}
                        class:dark:border-indigo-700={recordingKeyFor ===
                          binding.id}
                        class:dark:bg-neutral-800={recordingKeyFor !==
                          binding.id}
                        class:dark:text-neutral-300={recordingKeyFor !==
                          binding.id && binding.key}
                        class:dark:text-neutral-500={recordingKeyFor !==
                          binding.id && !binding.key}
                        class:dark:border-neutral-700={recordingKeyFor !==
                          binding.id}
                        on:click={() => startRecordingKey(binding.id)}
                      >
                        {#if recordingKeyFor === binding.id}
                          <span class="animate-pulse">Listening...</span>
                        {:else if binding.key}
                          {binding.key}
                        {:else}
                          Unbound
                        {/if}
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            </div>
          {/each}
        {/if}
      </div>

      <!-- Footer -->
      <div
        class="bg-neutral-50 dark:bg-neutral-900/50 px-6 py-4 border-t border-neutral-200 dark:border-neutral-800 flex justify-between items-center"
      >
        <div class="flex items-center gap-4">
          <button
            on:click={resetAllBindings}
            title="Reset all key bindings to defaults"
            class="px-3 py-1.5 text-sm rounded-md bg-red-50 dark:bg-red-900/20 text-red-600 hover:bg-red-100 dark:hover:bg-red-800 transition-colors"
          >
            Reset All
          </button>

          <div
            class="flex items-center gap-2 text-xs text-neutral-500 dark:text-neutral-400"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              stroke-width="1.5"
              stroke="currentColor"
              class="size-4"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
              />
            </svg>
            <span
              >Click a keybinding to record a new one. Press <kbd
                class="font-mono bg-neutral-200 dark:bg-neutral-700 px-1 rounded"
                >Esc</kbd
              > while recording to unbind.</span
            >
          </div>
        </div>
        <button
          on:click={() => (isOpen = false)}
          class="px-4 py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-semibold rounded-lg shadow-sm hover:opacity-90 transition-opacity"
        >
          Done
        </button>
      </div>
    </div>
  </div>
{/if}
