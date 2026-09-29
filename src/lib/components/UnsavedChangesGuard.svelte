<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<!--
  Asks what to do with unsaved changes before the project is reset or the app
  closes, and names a project that has never been saved.
-->
<script lang="ts">
  import { get } from "svelte/store";
  import { currentFilePath, isUnsaved } from "../../stores";
  import { saveProject, joinPath } from "../../utils/fileHandlers";
  import { DEFAULT_PROJECT_EXTENSION } from "../../utils/fileExtensions";
  import { getElectronAPI } from "../../utils/platform";
  import SaveNameDialog from "./dialogs/SaveNameDialog.svelte";
  import UnsavedChangesDialog from "./dialogs/UnsavedChangesDialog.svelte";

  interface Props {
    /** Starts a new project. Called once the user has dealt with unsaved changes. */
    onReset: () => void;
  }

  let { onReset }: Props = $props();

  let showSaveName = $state(false);
  let showUnsaved = $state(false);
  let pendingAction: "reset" | "close" | null = null;
  let resolveSaveName: ((name: string | null) => void) | null = null;

  function askForName(): Promise<string | null> {
    return new Promise((resolve) => {
      resolveSaveName = resolve;
      showSaveName = true;
    });
  }

  function answerSaveName(name: string | null) {
    resolveSaveName?.(name);
    resolveSaveName = null;
  }

  /**
   * Saves the project before the user moves on to something else. A project
   * that has never been saved is named and put in the project folder.
   * Returns false if the save failed or the user cancelled.
   */
  export async function saveBeforeContinuing(): Promise<boolean> {
    const electronAPI = getElectronAPI();
    const savedDir = get(currentFilePath)
      ? null
      : await electronAPI?.getSavedDirectory?.();
    if (!savedDir) return saveProject();

    const name = await askForName();
    if (!name) return false;
    return saveProject({
      path: joinPath(savedDir, `${name}${DEFAULT_PROJECT_EXTENSION}`),
    });
  }

  /** Starts a new project, first asking about unsaved changes. */
  export function requestReset() {
    if (get(isUnsaved)) ask("reset");
    else onReset();
  }

  /** Asks about unsaved changes before the window closes. */
  export function requestClose() {
    ask("close");
  }

  function ask(action: "reset" | "close") {
    pendingAction = action;
    showUnsaved = true;
  }

  function continuePendingAction() {
    if (pendingAction === "close") getElectronAPI()?.sendCloseApproved?.();
    else onReset();
    pendingAction = null;
  }

  async function handleSave() {
    showUnsaved = false;
    if (await saveBeforeContinuing()) continuePendingAction();
    else pendingAction = null;
  }

  function handleDiscard() {
    showUnsaved = false;
    continuePendingAction();
  }

  function handleCancel() {
    showUnsaved = false;
    pendingAction = null;
  }
</script>

<SaveNameDialog
  bind:show={showSaveName}
  onSave={answerSaveName}
  onCancel={() => answerSaveName(null)}
/>

<UnsavedChangesDialog
  bind:show={showUnsaved}
  onSave={handleSave}
  onDiscard={handleDiscard}
  onCancel={handleCancel}
/>
