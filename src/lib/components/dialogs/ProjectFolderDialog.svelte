<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { getElectronAPI } from "../../../utils/platform";
  import { saveAutoPathsDirectory } from "../../../utils/directorySettings";
  import { projectFolderPrompt } from "../../../stores";
  import { FolderIcon } from "../icons";
  import { ui } from "../../ui";

  async function chooseFolder() {
    try {
      const folder = await getElectronAPI()?.setDirectory?.();
      if (!folder) return;
      await saveAutoPathsDirectory(folder);
      $projectFolderPrompt?.({ folder });
    } catch (err) {
      console.error("Failed to select directory:", err);
    }
  }

  const cancel = () => $projectFolderPrompt?.("cancel");
</script>

<svelte:window
  onkeydown={(e) => $projectFolderPrompt && e.key === "Escape" && cancel()}
/>

{#if $projectFolderPrompt}
  <div
    class="{ui.overlay} z-[1100] transition-all duration-300"
    role="dialog"
    aria-modal="true"
    aria-labelledby="project-folder-title"
  >
    <div
      class="{ui.dialog} w-full max-w-2xl flex flex-col p-8 md:p-12 items-center text-center animate-fade-in max-h-[90vh] overflow-y-auto"
    >
      <div
        class="w-20 h-20 shrink-0 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center text-emerald-600 dark:text-emerald-400 mb-8"
      >
        <FolderIcon className="w-6 h-6" />
      </div>
      <h2
        id="project-folder-title"
        class="text-3xl font-extrabold text-neutral-900 dark:text-neutral-100 mb-4"
      >
        Where Should Your Paths Live?
      </h2>
      <p
        class="text-neutral-700 dark:text-neutral-300 mb-8 text-lg leading-relaxed"
      >
        Pick a project folder to keep your paths together. Turtle Tracer will
        show it in the File Manager and open your saved paths from there.
        <br /><br />
        For most FTC projects, the best place is:<br />
        <code
          class="bg-neutral-100 dark:bg-neutral-900/50 px-3 py-1.5 rounded-md text-emerald-700 dark:text-emerald-300 font-mono text-sm mt-3 inline-block"
          >TeamCode/src/main/assets/AutoPaths/</code
        >
      </p>
      <div
        class="flex flex-col sm:flex-row items-center gap-3 w-full justify-center"
      >
        <button class="{ui.btn.ghost} w-full sm:w-auto" onclick={cancel}>
          Cancel
        </button>
        <button
          class="{ui.btn.success} w-full sm:w-auto"
          onclick={chooseFolder}
        >
          <FolderIcon className="w-6 h-6" />
          Select Directory...
        </button>
      </div>
    </div>
  </div>
{/if}

<style lang="postcss">
  .animate-fade-in {
    animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(15px) scale(0.97);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
