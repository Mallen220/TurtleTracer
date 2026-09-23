<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import hotkeys from "hotkeys-js";

  // Override hotkeys.filter to allow shortcuts to trigger even when inputs are focused.
  hotkeys.filter = () => true;

  import CommandPalette from "./CommandPalette.svelte";
  import { executeCommandBus, availableCommands } from "../../stores";
  import {
    linesStore,
    sequenceStore,
    settingsStore,
    playingStore,
  } from "../projectStore";

  import { loadFile } from "../../utils/fileHandlers";
  import { DEFAULT_KEY_BINDINGS } from "../../config/keybindings";
  import { shouldBlockShortcut } from "./shortcuts/utils";
  import {
    generateLineCommands,
    generateWaitCommands,
    generateRotateCommands,
    generateEventCommands,
    generateKeybindingCommands,
  } from "./shortcuts/commandPaletteItems";
  import {
    fetchProjectFileCommands,
    type FileCommandItem,
  } from "./shortcuts/fileCommands";
  import {
    buildActionHandlers,
    type ActionHandler,
  } from "./shortcuts/shortcutActions";

  interface Props {
    // Actions
    saveProject: () => void;
    resetProject: () => void;
    saveFileAs: () => void;
    exportGif: () => void;
    exportImage?: () => void;
    undoAction: () => void;
    redoAction: () => void;
    play: () => void;
    pause: () => void;
    resetAnimation: () => void;
    stepForward: () => void;
    stepBackward: () => void;
    splitPath?: () => void;
    recordChange: (action?: string) => void;
    controlTabRef?: any;
    activeControlTab?: "path" | "field" | "table" | "code";
    toggleStats?: () => void;
    toggleSidebar?: () => void;
    toggleControlTab?: () => void;
    fieldRenderer?: any;
    // Optional callback provided by App.svelte to open the What's New dialog
    openWhatsNew: () => void;
  }

  let {
    saveProject,
    resetProject,
    saveFileAs,
    exportGif,
    exportImage = () => {},
    undoAction,
    redoAction,
    play,
    pause,
    resetAnimation,
    stepForward,
    stepBackward,
    splitPath = () => {},
    recordChange,
    controlTabRef = $bindable(null),
    activeControlTab = $bindable("path"),
    toggleStats = () => {},
    toggleSidebar = () => {},
    toggleControlTab = () => {},
    fieldRenderer = null,
    openWhatsNew,
  }: Props = $props();

  // Reactive Values
  let settings = $derived($settingsStore);
  let lines = $derived($linesStore);
  let sequence = $derived($sequenceStore);
  let playing = $derived($playingStore);

  // Internal State
  let showCommandPalette = $state(false);
  let fileInput: HTMLInputElement | undefined = $state();
  let fileCommands: FileCommandItem[] = $state([]);

  async function loadFileCommands() {
    fileCommands = await fetchProjectFileCommands();
  }

  $effect(() => {
    if (showCommandPalette) {
      loadFileCommands();
    }
  });

  // --- Actions Registry ---
  let actions: Record<string, ActionHandler> = $derived(
    buildActionHandlers({
      saveProject,
      resetProject,
      saveFileAs,
      exportGif,
      exportImage,
      undoAction,
      redoAction,
      play,
      pause,
      resetAnimation,
      stepForward,
      stepBackward,
      splitPath,
      recordChange,
      controlTabRef,
      getActiveControlTab: () => activeControlTab,
      setActiveControlTab: (tab) => {
        activeControlTab = tab;
      },
      toggleStats,
      toggleSidebar,
      toggleControlTab,
      fieldRenderer,
      openWhatsNew,
      toggleCommandPalette: () => {
        showCommandPalette = !showCommandPalette;
      },
      closeCommandPalette: () => {
        showCommandPalette = false;
      },
      isCommandPaletteOpen: () => showCommandPalette,
      openFileInput: () => fileInput?.click(),
      fetchFiles: loadFileCommands,
      isPlaying: () => playing,
    }),
  );

  // --- Derived Commands for Search ---
  let lineCommands = $derived(generateLineCommands(lines, controlTabRef));
  let waitCommands = $derived(generateWaitCommands(sequence, controlTabRef));
  let rotateCommands = $derived(
    generateRotateCommands(sequence, controlTabRef),
  );
  let eventCommands = $derived(
    generateEventCommands(lines, sequence, controlTabRef),
  );

  // Derive commands list for Command Palette
  let paletteCommands = $derived([
    ...generateKeybindingCommands(
      settings?.keyBindings || DEFAULT_KEY_BINDINGS,
      actions as any,
    ),
    ...fileCommands,
    ...lineCommands,
    ...waitCommands,
    ...rotateCommands,
    ...eventCommands,
  ]);

  $effect(() => {
    availableCommands.set(paletteCommands);
  });

  $effect(() => {
    if ($executeCommandBus) {
      const cmdId = $executeCommandBus;
      executeCommandBus.set(null);
      const cmd = paletteCommands.find((c) => c.id === cmdId);
      cmd?.action?.();
    }
  });

  $effect(() => {
    if (settings?.keyBindings) {
      hotkeys.unbind();

      // Bind all actions defined in settings
      settings.keyBindings.forEach((binding) => {
        const handler = actions[binding.action];
        if (handler && binding.key) {
          hotkeys(binding.key, (e) => {
            if (shouldBlockShortcut(e, binding.id)) return;
            e.preventDefault();
            handler(e);
          });
        }
      });
    }
  });
</script>

<CommandPalette
  isOpen={showCommandPalette}
  onClose={() => (showCommandPalette = false)}
  commands={paletteCommands}
/>

<!-- Hidden file input for Open File shortcut -->
<input
  bind:this={fileInput}
  type="file"
  accept=".turt,.pp"
  class="hidden"
  style="display:none;"
  tabindex="-1"
  onchange={function (e) {
    const target = e.currentTarget || e.target;
    if (
      target instanceof HTMLInputElement &&
      target.files &&
      target.files.length > 0
    ) {
      loadFile(e);
      target.value = "";
    }
  }}
/>
