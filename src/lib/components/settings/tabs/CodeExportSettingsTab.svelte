<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { getElectronAPI } from "../../../../utils/platform";
  import { settingsEditor, type SettingsTabProps } from "../settingsEditor";
  import { fade } from "svelte/transition";
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { currentFilePath, currentDirectoryStore } from "../../../../stores";
  import * as ICONS from "../../icons";
  import { isBrowser } from "../../../../utils/platform";
  import { COMMAND_LIBRARIES } from "../../../exporters/commandLibraries";
  import { ui } from "../../../ui";

  type Props = SettingsTabProps;

  let { settings = $bindable(), searchQuery }: Props = $props();

  const { set, resettable } = settingsEditor(
    () => settings,
    (next) => (settings = next),
  );

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
    const electronAPI = getElectronAPI();
    if (!electronAPI || !electronAPI.selectDirectory) return;

    const path = await electronAPI.selectDirectory();
    if (path) {
      const base = getBasePath();
      if (
        settings.autoExportPathMode === "relative" &&
        base &&
        electronAPI.makeRelativePath
      ) {
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
    const electronAPI = getElectronAPI();
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
        settings.autoExportPath =
          (await electronAPI.resolvePath?.(base, settings.autoExportPath)) ??
          settings.autoExportPath;
      } else if (newMode === "relative") {
        settings.autoExportPath =
          (await electronAPI.makeRelativePath?.(
            base,
            settings.autoExportPath,
          )) ?? settings.autoExportPath;
      }
    }

    settings.autoExportPathMode = newMode;
  }
</script>

<div class="section-container mb-8">
  {#if searchQuery}
    <h4 class="{ui.heading} mb-4 border-b pb-1">Code Export</h4>
  {/if}
  <SettingsItem
    label="Auto Export Code"
    {...resettable("autoExportCode")}
    description="Automatically export code when project is saved"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.autoExportCode}
      onchange={(e) => set("autoExportCode", e.currentTarget.checked)}
      class={ui.checkbox}
    />
  </SettingsItem>

  {#if settings.autoExportCode}
    <div transition:fade>
      {#if !isBrowser}
        <SettingsItem
          label="Export Path Mode"
          {...resettable("autoExportPathMode")}
          description="How the path is stored relative to the project file"
          {searchQuery}
          layout="row"
        >
          <div class={ui.tabList}>
            <button
              class={ui.tab(
                settings.autoExportPathMode === "relative" ||
                  !settings.autoExportPathMode,
              )}
              onclick={() => handleModeChange("relative")}
            >
              Relative
            </button>
            <button
              class={ui.tab(settings.autoExportPathMode === "absolute")}
              onclick={() => handleModeChange("absolute")}
            >
              Absolute
            </button>
          </div>
        </SettingsItem>
      {/if}

      <SettingsItem
        label="Export Path"
        {...resettable("autoExportPath")}
        description="Directory to save exported code"
        {searchQuery}
        layout="col"
      >
        <div class="flex gap-2">
          <input
            type="text"
            value={settings.autoExportPath}
            oninput={(e) => set("autoExportPath", e.currentTarget.value)}
            class="{ui.input} w-full font-mono"
            placeholder="GeneratedCode"
          />
          {#if !isBrowser}
            <button
              aria-label="Browse Directory"
              onclick={handleBrowse}
              class={ui.btn.secondary}
              title="Browse Directory"
            >
              <!-- Folder Icon -->
              <ICONS.FolderIcon className="size-5" />
            </button>
          {/if}
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
        {...resettable("autoExportFormat")}
        description="Format of the generated code"
        {searchQuery}
        layout="col"
      >
        <select
          value={settings.autoExportFormat}
          onchange={(e) =>
            set("autoExportFormat", e.currentTarget.value as any)}
          class="{ui.input} w-full"
        >
          <option value="java">OpMode Class</option>
          <option value="sequential">Sequential Command</option>
          <option value="points">Points Array</option>
          <option value="json">.Turt Project Data</option>
        </select>
      </SettingsItem>

      <SettingsItem
        label="Code Units"
        {...resettable("codeUnits")}
        description="Unit system generated in code"
        {searchQuery}
        layout="col"
      >
        <select
          value={settings.codeUnits}
          onchange={(e) => set("codeUnits", e.currentTarget.value as any)}
          class="{ui.input} w-full"
        >
          <option value="imperial">Imperial (Inches)</option>
          <option value="metric">Metric (cm)</option>
        </select>
        {#if settings.codeUnits === "metric" && !settings.autoExportEmbedPoseData && settings.autoExportFormat === "sequential"}
          <div
            class="{ui.alert.warning} mt-2 flex items-center gap-2"
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
            {...resettable("autoExportFullClass")}
            description="Include class definition and imports"
            {searchQuery}
            layout="row"
          >
            <input
              type="checkbox"
              checked={settings.autoExportFullClass}
              onchange={(e) =>
                set("autoExportFullClass", e.currentTarget.checked)}
              class={ui.checkbox}
            />
          </SettingsItem>

          <SettingsItem
            label="Telemetry Implementation"
            {...resettable("telemetryImplementation")}
            description="Select telemetry backend for generated code"
            {searchQuery}
            layout="col"
          >
            <select
              value={settings.telemetryImplementation}
              onchange={(e) =>
                set("telemetryImplementation", e.currentTarget.value as any)}
              class="{ui.input} w-full"
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
            {...resettable("autoExportTargetLibrary")}
            description="Command-based library to target"
            {searchQuery}
            layout="col"
          >
            <select
              value={settings.autoExportTargetLibrary}
              onchange={(e) =>
                set("autoExportTargetLibrary", e.currentTarget.value as any)}
              class="{ui.input} w-full"
            >
              {#each COMMAND_LIBRARIES as library (library.id)}
                <option value={library.id}>{library.label}</option>
              {/each}
            </select>
          </SettingsItem>

          <SettingsItem
            label="Embed Pose Data"
            {...resettable("autoExportEmbedPoseData")}
            description="Embed pose data directly in the code (no .turt file)"
            {searchQuery}
            layout="row"
          >
            <input
              type="checkbox"
              checked={settings.autoExportEmbedPoseData}
              onchange={(e) =>
                set("autoExportEmbedPoseData", e.currentTarget.checked)}
              class={ui.checkbox}
            />
          </SettingsItem>
        </div>
      {/if}

      {#if settings.autoExportFormat === "java" || settings.autoExportFormat === "sequential"}
        <div transition:fade>
          <SettingsItem
            label="Language"
            {...resettable("codeLanguage")}
            description="Write the code in Java or Kotlin"
            {searchQuery}
            layout="col"
          >
            <select
              value={settings.codeLanguage ?? "java"}
              onchange={(e) =>
                set("codeLanguage", e.currentTarget.value as any)}
              class="{ui.input} w-full"
            >
              <option value="java">Java</option>
              <option value="kotlin">Kotlin</option>
            </select>
          </SettingsItem>

          <SettingsItem
            label="Package Name"
            {...resettable("javaPackageName")}
            description="Java package for the generated class"
            {searchQuery}
            layout="col"
          >
            <input
              type="text"
              value={settings.javaPackageName}
              oninput={(e) => set("javaPackageName", e.currentTarget.value)}
              class="{ui.input} w-full font-mono"
              placeholder="org.firstinspires.ftc.teamcode.Commands.AutoCommands"
            />
          </SettingsItem>
        </div>
      {/if}
    </div>
  {/if}
</div>
