<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { RobotProfile, Settings } from "../../../types";
  import { notification } from "../../../stores";
  import { robotProfilesStore } from "../../../lib/projectStore";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import SaveIcon from "../icons/SaveIcon.svelte";
  import DownloadIcon from "../icons/DownloadIcon.svelte";
  import { fade } from "svelte/transition";

  interface Props {
    settings: Settings;
    // Callback to force update of settings in parent
    onSettingsChange: () => void;
  }

  let { settings = $bindable(), onSettingsChange }: Props = $props();

  let profiles = $derived($robotProfilesStore);
  let selectedProfileId: string = $state("");
  let newProfileName: string = $state("");
  let isCreating = $state(false);

  let updateConfirming = $state(false);
  let updateTimeout: ReturnType<typeof setTimeout>;

  onDestroy(() => {
    clearTimeout(updateTimeout);
  });

  function handleCreateProfile() {
    if (!newProfileName.trim()) {
      notification.set({
        message: "Please enter a profile name",
        type: "warning",
      });
      return;
    }

    const newProfile: RobotProfile = {
      id: crypto.randomUUID(),
      name: newProfileName.trim(),
      rLength: settings.rLength,
      rWidth: settings.rWidth,
      maxVelocity: settings.maxVelocity,
      maxAcceleration: settings.maxAcceleration,
      maxDeceleration: settings.maxDeceleration || 0,
      kFriction: settings.kFriction,
      aVelocity: settings.aVelocity,
      xVelocity: settings.xVelocity,
      yVelocity: settings.yVelocity,
      robotImage: settings.robotImage,
      robotDriveType: settings.robotDriveType,
      showRobotArrows: settings.showRobotArrows,
      showFakeHeadingArrow: settings.showFakeHeadingArrow,
      fakeHeadingArrowColor: settings.fakeHeadingArrowColor,
    } as RobotProfile;

    robotProfilesStore.update((p) => [...p, newProfile]);
    selectedProfileId = newProfile.id;
    isCreating = false;
    newProfileName = "";
    notification.set({
      message: `Profile "${newProfile.name}" created`,
      type: "success",
    });
  }

  function handleApplyProfile() {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) return;

    if (
      !confirm(
        `Apply settings from "${profile.name}"? This will overwrite your current robot configuration.`,
      )
    ) {
      return;
    }

    settings.rLength = profile.rLength;
    settings.rWidth = profile.rWidth;
    settings.maxVelocity = profile.maxVelocity;
    settings.maxAcceleration = profile.maxAcceleration;
    settings.maxDeceleration = profile.maxDeceleration;
    settings.maxAngularAcceleration =
      profile.maxAngularAcceleration ?? settings.maxAngularAcceleration;
    settings.kFriction = profile.kFriction;
    settings.aVelocity = profile.aVelocity;
    settings.xVelocity = profile.xVelocity;
    settings.yVelocity = profile.yVelocity;
    if (profile.robotImage) {
      settings.robotImage = profile.robotImage;
    }
    if (profile.robotDriveType) {
      settings.robotDriveType = profile.robotDriveType;
    }
    if (profile.showRobotArrows !== undefined) {
      settings.showRobotArrows = profile.showRobotArrows;
    }
    settings.showFakeHeadingArrow = profile.showFakeHeadingArrow ?? false;
    settings.fakeHeadingArrowColor = profile.fakeHeadingArrowColor || "#ef4444";

    onSettingsChange();
    notification.set({
      message: `Profile "${profile.name}" applied`,
      type: "success",
    });
  }

  function handleUpdateProfile() {
    const profileIndex = profiles.findIndex((p) => p.id === selectedProfileId);
    if (profileIndex === -1) return;

    const updatedProfile = {
      ...profiles[profileIndex],
      rLength: settings.rLength,
      rWidth: settings.rWidth,
      maxVelocity: settings.maxVelocity,
      maxAcceleration: settings.maxAcceleration,
      maxDeceleration: settings.maxDeceleration || 0,
      maxAngularAcceleration: settings.maxAngularAcceleration,
      kFriction: settings.kFriction,
      aVelocity: settings.aVelocity,
      xVelocity: settings.xVelocity,
      yVelocity: settings.yVelocity,
      robotImage: settings.robotImage,
      robotDriveType: settings.robotDriveType,
      showRobotArrows: settings.showRobotArrows,
      showFakeHeadingArrow: settings.showFakeHeadingArrow,
      fakeHeadingArrowColor: settings.fakeHeadingArrowColor,
    } as RobotProfile;

    robotProfilesStore.update((p) => {
      const newProfiles = [...p];
      newProfiles[profileIndex] = updatedProfile;
      return newProfiles;
    });

    notification.set({
      message: `Profile "${profiles[profileIndex].name}" updated`,
      type: "success",
    });
  }

  function handleUpdateClick() {
    if (updateConfirming) {
      handleUpdateProfile();
      updateConfirming = false;
      clearTimeout(updateTimeout);
    } else {
      updateConfirming = true;
      updateTimeout = setTimeout(() => {
        updateConfirming = false;
      }, 3000);
    }
  }

  function handleUpdateBlur() {
    setTimeout(() => {
      updateConfirming = false;
      clearTimeout(updateTimeout);
    }, 200);
  }

  function handleDeleteProfile() {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) return;

    // No confirm() here, handled by DeleteButtonWithConfirm

    robotProfilesStore.update((p) =>
      p.filter((x) => x.id !== selectedProfileId),
    );
    selectedProfileId = "";
    notification.set({
      message: `Profile "${profile.name}" deleted`,
      type: "success",
    });
  }

  function handleImportProfile(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        if (typeof event.target?.result === "string") {
          const json = JSON.parse(event.target.result);

          // Basic validation to ensure it looks like a robot profile
          if (!json.name || typeof json.maxVelocity !== "number") {
            throw new Error("Invalid robot profile format.");
          }

          const newProfile: RobotProfile = {
            id: crypto.randomUUID(),
            name: `${json.name} (Imported)`,
            rLength: json.rLength ?? settings.rLength,
            rWidth: json.rWidth ?? settings.rWidth,
            maxVelocity: json.maxVelocity,
            maxAcceleration: json.maxAcceleration ?? settings.maxAcceleration,
            maxDeceleration: json.maxDeceleration ?? 0,
            maxAngularAcceleration: json.maxAngularAcceleration,
            kFriction: json.kFriction ?? settings.kFriction,
            aVelocity: json.aVelocity ?? settings.aVelocity,
            xVelocity: json.xVelocity ?? settings.xVelocity,
            yVelocity: json.yVelocity ?? settings.yVelocity,
            robotImage: json.robotImage,
            robotDriveType: json.robotDriveType,
            showRobotArrows: json.showRobotArrows,
            showFakeHeadingArrow: json.showFakeHeadingArrow,
            fakeHeadingArrowColor: json.fakeHeadingArrowColor,
          } as RobotProfile;

          robotProfilesStore.update((p) => [...p, newProfile]);
          selectedProfileId = newProfile.id;

          notification.set({
            message: `Profile "${newProfile.name}" imported successfully`,
            type: "success",
            timeout: 3000,
          });
        }
      } catch (err) {
        notification.set({
          message: "Error importing profile: " + (err as Error).message,
          type: "error",
        });
      }
      target.value = "";
    };
    reader.readAsText(file);
  }

  function handleExportProfile() {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) return;

    try {
      const dataStr = JSON.stringify(profile, null, 2);
      const blob = new Blob([dataStr], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const downloadAnchorNode = document.createElement("a");
      downloadAnchorNode.setAttribute("href", url);
      const safeName = profile.name
        .replaceAll(/[^a-z0-9]/gi, "_")
        .toLowerCase();
      downloadAnchorNode.setAttribute(
        "download",
        `robot-profile-${safeName}.json`,
      );
      document.body.appendChild(downloadAnchorNode);
      downloadAnchorNode.click();
      downloadAnchorNode.remove();
      URL.revokeObjectURL(url);

      notification.set({
        message: `Profile "${profile.name}" exported`,
        type: "success",
        timeout: 3000,
      });
    } catch (e) {
      notification.set({
        message: "Failed to export profile: " + (e as Error).message,
        type: "error",
      });
    }
  }
</script>

<div
  class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-200 dark:border-neutral-700 p-3 mb-4"
>
  <div class="flex items-center justify-between mb-3">
    <div>
      <h3 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
        Robot Profiles
      </h3>
      <p class="text-xs text-neutral-500 dark:text-neutral-400">
        Save and load robot configurations
      </p>
    </div>
    <div class="flex gap-2">
      {#if !isCreating}
        <button
          onclick={() =>
            document.getElementById("profile-import-input")?.click()}
          class="text-xs px-2 py-1 bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 rounded hover:bg-neutral-200 dark:hover:bg-neutral-700 transition-colors"
          aria-label="Import profile"
        >
          Import
        </button>
        <button
          onclick={() => (isCreating = true)}
          class="text-xs px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
          aria-label="Create new profile"
        >
          + New Profile
        </button>
        <input
          type="file"
          id="profile-import-input"
          class="hidden"
          tabindex="-1"
          accept=".json"
          onchange={handleImportProfile}
        />
      {/if}
    </div>
  </div>

  {#if isCreating}
    <div
      class="flex flex-col gap-2 mb-3 bg-neutral-50 dark:bg-neutral-900/50 p-2 rounded"
    >
      <label
        for="profile-name"
        class="text-xs font-medium text-neutral-700 dark:text-neutral-300"
        >Profile Name</label
      >
      <input
        id="profile-name"
        type="text"
        bind:value={newProfileName}
        placeholder="e.g. Competition Bot"
        class="w-full px-2 py-1 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        onkeydown={(e) => {
          if (e.key === "Enter") handleCreateProfile();
          if (e.key === "Escape") isCreating = false;
        }}
      />
      <div class="flex justify-end gap-2 mt-1">
        <button
          onclick={() => (isCreating = false)}
          class="text-xs px-2 py-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          onclick={handleCreateProfile}
          class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          Save Current Settings
        </button>
      </div>
    </div>
  {/if}

  <div class="flex flex-col gap-2">
    {#if profiles.length === 0}
      <div
        class="text-xs text-neutral-400 text-center py-4 italic border border-dashed border-neutral-200 dark:border-neutral-700 rounded"
      >
        No saved profiles yet.
      </div>
    {:else}
      <div class="flex gap-2">
        <select
          bind:value={selectedProfileId}
          class="flex-1 px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
          aria-label="Select robot profile"
        >
          <option value="" disabled>Select a profile...</option>
          {#each profiles as profile}
            <option value={profile.id}>{profile.name}</option>
          {/each}
        </select>

        <button
          onclick={handleApplyProfile}
          disabled={!selectedProfileId}
          class="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          title="Load settings from selected profile"
        >
          Load
        </button>
      </div>

      {#if selectedProfileId}
        <div class="flex justify-between items-center mt-1 px-1 h-8">
          <div class="text-xs text-neutral-400">
            Actions for selected profile:
          </div>
          <div class="flex items-center gap-1">
            <!-- Update Button with inline confirm -->
            <button
              onclick={handleUpdateClick}
              onblur={handleUpdateBlur}
              class={`ml-1 p-1.5 rounded-md transition-all duration-200 flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                updateConfirming
                  ? "bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 ring-1 ring-blue-500/50 w-20"
                  : "hover:bg-blue-50 dark:hover:bg-blue-900/20 text-neutral-400 hover:text-blue-500 w-8"
              }`}
              title="Overwrite profile with current settings"
            >
              {#if updateConfirming}
                <span
                  class="text-xs font-bold whitespace-nowrap"
                  in:fade={{ duration: 150 }}>Confirm</span
                >
              {:else}
                <div
                  in:fade={{ duration: 150 }}
                  class="flex items-center justify-center"
                >
                  <SaveIcon className="size-4" strokeWidth={2} />
                </div>
              {/if}
            </button>

            <!-- Export Button -->
            <button
              onclick={handleExportProfile}
              class="ml-1 p-1.5 rounded-md transition-all duration-200 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 w-8"
              title="Export Profile"
            >
              <DownloadIcon className="size-4" strokeWidth={2} />
            </button>

            <!-- Delete Button -->
            <DeleteButtonWithConfirm
              onclick={handleDeleteProfile}
              title="Delete Profile"
            />
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
