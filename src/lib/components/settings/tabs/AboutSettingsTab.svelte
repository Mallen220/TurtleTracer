<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DotIcon } from "../../icons";
  import packageJson from "../../../../../package.json";
  import { ui } from "../../../ui";
  interface Props {
    searchQuery: string;
  }

  let { searchQuery }: Props = $props();
  let appVersion = packageJson.version;
</script>

<div class="section-container mb-8">
  {#if searchQuery}
    <h4 class="{ui.heading} mb-4 border-b pb-1">About</h4>
  {/if}

  <SettingsItem
    label="Turtle Tracer"
    description={`Version ${appVersion}`}
    {searchQuery}
    section
  >
    <div class="flex flex-col items-center py-6 text-center">
      <img
        src="/icon.png"
        alt="App Icon"
        class="w-20 h-20 mb-4 object-contain"
      />
      <h3 class="text-xl font-bold text-neutral-900 dark:text-neutral-100">
        Turtle Tracer
      </h3>
      <p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
        Version {appVersion}
      </p>

      <div class="text-sm space-y-1 mb-6">
        <p>Copyright © 2026 Matthew Allen</p>
        <p>Licensed under Modified Apache License, Version 2.0</p>
      </div>

      <div class="flex gap-4 text-sm font-medium mb-8">
        <a
          href="https://www.turtletracer.com/"
          target="_blank"
          rel="noopener noreferrer"
          class={ui.link}>Documentation</a
        >
        <DotIcon
          className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
        />
        <a
          href="https://github.com/Mallen220/TurtleTracer"
          target="_blank"
          rel="noopener noreferrer"
          class={ui.link}>GitHub</a
        >
        <DotIcon
          className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
        />
        <a
          href="https://discord.gg/chHSzS4ewF"
          target="_blank"
          rel="noopener noreferrer"
          class={ui.link}>Discord</a
        >
      </div>

      <div class="{ui.well} w-full max-w-sm p-4 text-left text-sm space-y-4">
        <div>
          <h4 class="font-semibold mb-2">Acknowledgments</h4>
          <ul
            class="list-disc pl-4 space-y-1 text-neutral-500 dark:text-neutral-400 text-xs"
          >
            <li>#16166 Watt's Up - Inspiration for the original Visualizer</li>
            <li>
              Pedro Pathing Developers - Inspiration for their library and
              extended visualizer
            </li>
            <li>FIRST Community - Support, inspiration, and endless testing</li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-2">Project Links</h4>
          <div class="flex flex-wrap gap-3 text-xs">
            <a
              href="https://github.com/Mallen220/TurtleTracer/issues"
              target="_blank"
              class={ui.link}>Issues</a
            >
            <DotIcon
              className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
            />
            <a
              href="https://github.com/Mallen220/TurtleTracer/releases"
              target="_blank"
              class={ui.link}>Releases</a
            >
            <DotIcon
              className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
            />
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/README.md"
              target="_blank"
              class={ui.link}>README</a
            >
            <DotIcon
              className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
            />
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/CODE_OF_CONDUCT.md"
              target="_blank"
              class={ui.link}>Code of Conduct</a
            >
            <DotIcon
              className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
            />
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/CONTRIBUTING.md"
              target="_blank"
              class={ui.link}>Contributing</a
            >
            <DotIcon
              className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
            />
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/LICENSE"
              target="_blank"
              class={ui.link}>License</a
            >
            <DotIcon
              className="-mx-1 text-neutral-300 dark:text-neutral-600 shrink-0"
            />
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/SECURITY.md"
              target="_blank"
              class={ui.link}>Security</a
            >
          </div>
        </div>
      </div>
    </div>
  </SettingsItem>
</div>
