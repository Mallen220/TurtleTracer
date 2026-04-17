<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";

  import { saveAutoPathsDirectory } from "../../../utils/directorySettings";
  import { RocketIcon, FolderIcon } from "../icons";

  interface Props {
    show?: boolean;
  }

  let { show = $bindable(false) }: Props = $props();

  const dispatch = createEventDispatcher();

  async function selectDirectory() {
    const electronAPI = (globalThis as any).electronAPI;
    if (electronAPI && electronAPI.setDirectory) {
      try {
        const selected = await electronAPI.setDirectory();
        if (selected) {
          await saveAutoPathsDirectory(selected);
          show = false;
          dispatch("setupComplete");
        }
      } catch (err) {}
    }
  }
</script>

{#if show}
  <div
    class="fixed inset-0 z-[110] flex items-center justify-center bg-black/80 backdrop-blur-2xl p-4 transition-all duration-300"
    role="dialog"
    aria-modal="true"
    aria-labelledby="setup-title"
  >
    <div
      class="bg-white dark:bg-neutral-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col p-8 md:p-12 items-center text-center animate-fade-in border border-neutral-200 dark:border-neutral-700 max-h-[90vh] overflow-y-auto"
    >
      <div
        class="w-20 h-20 shrink-0 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center text-green-600 dark:text-green-400 mb-8"
      >
        <FolderIcon className="w-6 h-6" />
      </div>
      <h2
        id="setup-title"
        class="text-3xl font-extrabold text-neutral-900 dark:text-white mb-4"
      >
        Select Your AutoPaths Directory
      </h2>
      <p
        class="text-neutral-600 dark:text-neutral-300 mb-8 text-lg leading-relaxed"
      >
        Welcome to Turtle Tracer! We're happy you're here. Before we get
        started, please select where paths should be saved.
        <br /><br />
        For most FTC projects, the best place is:<br />
        <code
          class="bg-neutral-100 dark:bg-neutral-900/50 px-3 py-1.5 rounded-lg text-green-700 dark:text-green-300 font-mono text-sm mt-3 inline-block"
          >TeamCode/src/main/assets/AutoPaths/</code
        >
      </p>
      <div
        class="bg-green-50 dark:bg-green-900/20 p-5 rounded-2xl mb-8 w-full max-w-lg text-left border border-green-100 dark:border-green-800/50"
      >
        <h3
          class="text-lg font-bold text-neutral-900 dark:text-white mb-2 flex items-center gap-2"
        >
          <RocketIcon className="w-6 h-6" /> Install TurtleTracerLib
        </h3>
        <p
          class="text-neutral-600 dark:text-neutral-300 text-sm leading-relaxed"
        >
          Install <strong>TurtleTracerLib</strong> to run <code>.turt</code>
          files directly (legacy <code>.pp</code> supported) and enable advanced
          commands. For documentation on setting it up with your project
          checkout the
          <a
            href="https://www.turtletracer.com/turtle-tracer-lib/installation/"
            class="text-green-700 dark:text-green-400 hover:underline font-semibold"
            >documentation</a
          >.
        </p>
      </div>
      <button
        class="px-8 py-3 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:shadow-green-500/20 transform hover:-translate-y-1 transition-all duration-200 flex items-center gap-3 text-lg w-full sm:w-auto justify-center"
        onclick={selectDirectory}
      >
        <FolderIcon className="w-6 h-6" />
        Select Directory...
      </button>
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
