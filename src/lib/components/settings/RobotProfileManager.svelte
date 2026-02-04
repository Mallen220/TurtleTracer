<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { onDestroy } from "svelte";
  import type { RobotProfile, Settings } from "../../../types";
  import { notification } from "../../../stores";
  import { robotProfilesStore } from "../../../lib/projectStore";
  import DeleteButtonWithConfirm from "../common/DeleteButtonWithConfirm.svelte";
  import SaveIcon from "../icons/SaveIcon.svelte";
  import { fade } from "svelte/transition";

  export let settings: Settings;
  // Callback to force update of settings in parent
  export let onSettingsChange: () => void;

  $: profiles = $robotProfilesStore;
  let selectedProfileId: string = "";
  let newProfileName: string = "";
  let isCreating = false;

  let updateConfirming = false;
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
    };

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

    // Keep confirm for Apply as it overwrites current settings and is a major action
    // We could make this inline too, but it's the primary action button.
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
    settings.kFriction = profile.kFriction;
    settings.aVelocity = profile.aVelocity;
    settings.xVelocity = profile.xVelocity;
    settings.yVelocity = profile.yVelocity;
    if (profile.robotImage) {
      settings.robotImage = profile.robotImage;
    }

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
      kFriction: settings.kFriction,
      aVelocity: settings.aVelocity,
      xVelocity: settings.xVelocity,
      yVelocity: settings.yVelocity,
      robotImage: settings.robotImage,
    };

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

    robotProfilesStore.update((p) => p.filter((x) => x.id !== selectedProfileId));
    selectedProfileId = "";
    notification.set({
      message: `Profile "${profile.name}" deleted`,
      type: "success",
    });
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
    {#if !isCreating}
      <button
        on:click={() => (isCreating = true)}
        class="text-xs px-2 py-1 bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50 transition-colors"
        aria-label="Create new profile"
      >
        + New Profile
      </button>
    {/if}
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
        on:keydown={(e) => {
          if (e.key === "Enter") handleCreateProfile();
          if (e.key === "Escape") isCreating = false;
        }}
      />
      <div class="flex justify-end gap-2 mt-1">
        <button
          on:click={() => (isCreating = false)}
          class="text-xs px-2 py-1 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          on:click={handleCreateProfile}
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
          on:click={handleApplyProfile}
          disabled={!selectedProfileId}
          class="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
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
              on:click={handleUpdateClick}
              on:blur={handleUpdateBlur}
              class={`ml-1 p-1.5 rounded-md transition-all duration-200 flex items-center justify-center ${
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

            <!-- Delete Button -->
            <DeleteButtonWithConfirm
              on:click={handleDeleteProfile}
              title="Delete Profile"
            />
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
