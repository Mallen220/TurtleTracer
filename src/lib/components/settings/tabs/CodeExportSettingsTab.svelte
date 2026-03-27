<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { fade } from "svelte/transition";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";
  import { currentFilePath, currentDirectoryStore } from "../../../../stores";
  import * as ICONS from "../../icons";

  export let settings: Settings;
  export let searchQuery: string;

  function getBasePath(): string | null {
    let curFile;
    currentFilePath.subscribe((v) => (curFile = v))();
    let curDir;
    currentDirectoryStore.subscribe((v) => (curDir = v))();
    if (curFile) return curFile;
    if (curDir) return curDir + "/placeholder.turt";
    return null;
  }

  async function handleBrowse() {
    const electronAPI = (window as any).electronAPI;
    if (!electronAPI || !electronAPI.selectDirectory) return;

    const path = await electronAPI.selectDirectory();
    if (path) {
      const base = getBasePath();
      if (settings.autoExportPathMode === "relative" && base) {
        settings.autoExportPath = await electronAPI.makeRelativePath(
          base,
          path,
        );
      } else {
        settings.autoExportPath = path;
      }
    }
  }

  async function handleModeChange(newMode: "relative" | "absolute") {
    const electronAPI = (window as any).electronAPI;
    const currentMode = settings.autoExportPathMode || "relative";

    if (currentMode === newMode) return;

    const base = getBasePath();

    if (
      electronAPI &&
      base &&
      settings.autoExportPath &&
      settings.autoExportPath.trim() !== ""
    ) {
      if (newMode === "absolute") {
        settings.autoExportPath = await electronAPI.resolvePath(
          base,
          settings.autoExportPath,
        );
      } else if (newMode === "relative") {
        settings.autoExportPath = await electronAPI.makeRelativePath(
          base,
          settings.autoExportPath,
        );
      }
    }

    settings.autoExportPathMode = newMode;
  }
</script>

<div class="section-container mb-8">
  {#if searchQuery}
    <h4
      class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
    >
      Code Export
    </h4>
  {/if}

  <SettingsItem
    label="Auto Export Code"
    isModified={settings.autoExportCode !== DEFAULT_SETTINGS.autoExportCode}
    onReset={() => {
      settings.autoExportCode = DEFAULT_SETTINGS.autoExportCode;
      settings = { ...settings };
    }}
    description="Automatically export code when project is saved"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      bind:checked={settings.autoExportCode}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
  </SettingsItem>

  {#if settings.autoExportCode}
    <div transition:fade>
      <SettingsItem
        label="Export Path Mode"
        isModified={settings.autoExportPathMode !==
          DEFAULT_SETTINGS.autoExportPathMode}
        onReset={() => {
          settings.autoExportPathMode = DEFAULT_SETTINGS.autoExportPathMode;
          settings = { ...settings };
        }}
        description="How the path is stored relative to the project file"
        {searchQuery}
        layout="row"
      >
        <div
          class="flex items-center gap-1 bg-neutral-100 dark:bg-neutral-800 p-1 rounded-lg border border-neutral-200 dark:border-neutral-700"
        >
          <button
            class="px-3 py-1 text-xs font-medium rounded-md transition-all {settings.autoExportPathMode ===
              'relative' || !settings.autoExportPathMode
              ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}"
            on:click={() => handleModeChange("relative")}
          >
            Relative
          </button>
          <button
            class="px-3 py-1 text-xs font-medium rounded-md transition-all {settings.autoExportPathMode ===
            'absolute'
              ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
              : 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200'}"
            on:click={() => handleModeChange("absolute")}
          >
            Absolute
          </button>
        </div>
      </SettingsItem>

      <SettingsItem
        label="Export Path"
        isModified={settings.autoExportPath !== DEFAULT_SETTINGS.autoExportPath}
        onReset={() => {
          settings.autoExportPath = DEFAULT_SETTINGS.autoExportPath;
          settings = { ...settings };
        }}
        description="Directory to save exported code"
        {searchQuery}
        layout="col"
      >
        <div class="flex gap-2">
          <input
            type="text"
            bind:value={settings.autoExportPath}
            class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
            placeholder="GeneratedCode"
          />
          <button
            on:click={handleBrowse}
            class="px-3 py-2 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 border border-neutral-300 dark:border-neutral-600 rounded-md text-neutral-700 dark:text-neutral-300 transition-colors"
            title="Browse Directory"
          >
            <!-- Folder Icon -->
            <svelte:component this={ICONS.FolderIcon} className="size-5" />
          </button>
        </div>
        <div class="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
          {#if settings.autoExportPathMode === "absolute"}
            Absolute path to the export directory.
          {:else}
            Relative to the project file location. Default: 'GeneratedCode'.
          {/if}
        </div>
      </SettingsItem>

      <SettingsItem
        label="Export Format"
        isModified={settings.autoExportFormat !==
          DEFAULT_SETTINGS.autoExportFormat}
        onReset={() => {
          settings.autoExportFormat = DEFAULT_SETTINGS.autoExportFormat;
          settings = { ...settings };
        }}
        description="Format of the generated code"
        {searchQuery}
        layout="col"
      >
        <select
          bind:value={settings.autoExportFormat}
          class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="java">Java Class</option>
          <option value="sequential">Sequential Command</option>
          <option value="points">Points Array</option>
          <option value="json">.Turt Project Data</option>
        </select>
      </SettingsItem>

      <SettingsItem
        label="Code Units"
        isModified={settings.codeUnits !== DEFAULT_SETTINGS.codeUnits}
        onReset={() => {
          settings.codeUnits = DEFAULT_SETTINGS.codeUnits;
          settings = { ...settings };
        }}
        description="Unit system generated in code"
        {searchQuery}
        layout="col"
      >
        <select
          bind:value={settings.codeUnits}
          class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="imperial">Imperial (Inches)</option>
          <option value="metric">Metric (cm)</option>
        </select>
        {#if settings.codeUnits === "metric" && !settings.autoExportEmbedPoseData && settings.autoExportFormat === "sequential"}
          <div
            class="mt-2 flex items-center gap-2 px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs rounded-lg border border-yellow-200 dark:border-yellow-800/50"
            role="alert"
          >
            <ICONS.TriangleWarningIcon className="size-4 shrink-0" />
            <span
              >Metric code generation requires embedding poses. Please enable
              'Embed Pose Data' below.</span
            >
          </div>
        {/if}
      </SettingsItem>

      {#if settings.autoExportFormat === "java"}
        <div transition:fade>
          <SettingsItem
            label="Generate Full Class"
            isModified={settings.autoExportFullClass !==
              DEFAULT_SETTINGS.autoExportFullClass}
            onReset={() => {
              settings.autoExportFullClass =
                DEFAULT_SETTINGS.autoExportFullClass;
              settings = { ...settings };
            }}
            description="Include class definition and imports"
            {searchQuery}
            layout="row"
          >
            <input
              type="checkbox"
              bind:checked={settings.autoExportFullClass}
              class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </SettingsItem>

          <SettingsItem
            label="Telemetry Implementation"
            isModified={settings.telemetryImplementation !==
              DEFAULT_SETTINGS.telemetryImplementation}
            onReset={() => {
              settings.telemetryImplementation =
                DEFAULT_SETTINGS.telemetryImplementation;
              settings = { ...settings };
            }}
            description="Select telemetry backend for generated code"
            {searchQuery}
            layout="col"
          >
            <select
              bind:value={settings.telemetryImplementation}
              class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Panels">Panels (Bylazar)</option>
              <option value="Standard">Standard (FTC)</option>
              <option value="Dashboard">FtcDashboard + Standard</option>
              <option value="None">None</option>
            </select>
          </SettingsItem>
        </div>
      {:else if settings.autoExportFormat === "sequential"}
        <div transition:fade>
          <SettingsItem
            label="Target Library"
            isModified={settings.autoExportTargetLibrary !==
              DEFAULT_SETTINGS.autoExportTargetLibrary}
            onReset={() => {
              settings.autoExportTargetLibrary =
                DEFAULT_SETTINGS.autoExportTargetLibrary;
              settings = { ...settings };
            }}
            description="Command-based library to target"
            {searchQuery}
            layout="col"
          >
            <select
              bind:value={settings.autoExportTargetLibrary}
              class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="SolversLib">SolversLib</option>
              <option value="NextFTC">NextFTC</option>
            </select>
          </SettingsItem>

          <SettingsItem
            label="Embed Pose Data"
            isModified={settings.autoExportEmbedPoseData !==
              DEFAULT_SETTINGS.autoExportEmbedPoseData}
            onReset={() => {
              settings.autoExportEmbedPoseData =
                DEFAULT_SETTINGS.autoExportEmbedPoseData;
              settings = { ...settings };
            }}
            description="Embed pose data directly in the code (no .turt file)"
            {searchQuery}
            layout="row"
          >
            <input
              type="checkbox"
              bind:checked={settings.autoExportEmbedPoseData}
              class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
            />
          </SettingsItem>
        </div>
      {/if}

      {#if settings.autoExportFormat === "java" || settings.autoExportFormat === "sequential"}
        <div transition:fade>
          <SettingsItem
            label="Package Name"
            isModified={settings.javaPackageName !==
              DEFAULT_SETTINGS.javaPackageName}
            onReset={() => {
              settings.javaPackageName = DEFAULT_SETTINGS.javaPackageName;
              settings = { ...settings };
            }}
            description="Java package for the generated class"
            {searchQuery}
            layout="col"
          >
            <input
              type="text"
              bind:value={settings.javaPackageName}
              class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
              placeholder="org.firstinspires.ftc.teamcode.Commands.AutoCommands"
            />
          </SettingsItem>
        </div>
      {/if}
    </div>
  {/if}
</div>
