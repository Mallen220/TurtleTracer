<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import packageJson from "../../../../../package.json";
  export let searchQuery: string;
  let appVersion = packageJson.version;
</script>

<div class="section-container mb-8">
  {#if searchQuery}
    <h4
      class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
    >
      About
    </h4>
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
      <h3 class="text-xl font-bold text-neutral-900 dark:text-white">
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
          href="https://github.com/Mallen220/TurtleTracer"
          target="_blank"
          class="text-blue-600 dark:text-blue-400 hover:underline">GitHub</a
        >
      </div>

      <div
        class="w-full max-w-sm bg-neutral-50 dark:bg-neutral-800 rounded-lg p-4 text-left text-sm space-y-4"
      >
        <div>
          <h4 class="font-semibold mb-2">Acknowledgments</h4>
          <ul
            class="list-disc pl-4 space-y-1 text-neutral-600 dark:text-neutral-400 text-xs"
          >
            <li>#16166 Watt's Up - Inspiration</li>
            <li>Pedro Pathing Developers</li>
            <li>FIRST Community</li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-2">Project Links</h4>
          <div class="flex flex-wrap gap-3 text-xs">
            <a
              href="https://github.com/Mallen220/TurtleTracer/issues"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline">Issues</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://github.com/Mallen220/TurtleTracer/releases"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >Releases</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/README.md"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline">README</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/CODE_OF_CONDUCT.md"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >Code of Conduct</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/CONTRIBUTING.md"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >Contributing</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/LICENSE"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >License</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://github.com/Mallen220/TurtleTracer/blob/main/SECURITY.md"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >Security</a
            >
            <span class="text-neutral-300 dark:text-neutral-600">•</span>
            <a
              href="https://discord.gg/chHSzS4ewF"
              target="_blank"
              class="text-blue-600 dark:text-blue-400 hover:underline"
              >Discord</a
            >
          </div>
        </div>
      </div>
    </div>
  </SettingsItem>
</div>
