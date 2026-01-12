<!-- Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount } from "svelte";
  import type { RobotProfile, Settings } from "../../../types";
  import { notification } from "../../../stores";

  export let settings: Settings;
  // Callback to force update of settings in parent
  export let onSettingsChange: () => void;

  let profiles: RobotProfile[] = [];
  let selectedProfileId: string = "";
  let newProfileName: string = "";
  let isCreating = false;

  const STORAGE_KEY = "pedro_robot_profiles";

  onMount(() => {
    loadProfiles();
  });

  function loadProfiles() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        profiles = JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load robot profiles", e);
    }
  }

  function saveProfiles() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
    } catch (e) {
      console.error("Failed to save robot profiles", e);
      notification.set({
        message: "Failed to save profiles to local storage",
        type: "error",
      });
    }
  }

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

    profiles = [...profiles, newProfile];
    saveProfiles();
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

    if (
      !confirm(`Update "${profiles[profileIndex].name}" with current settings?`)
    ) {
      return;
    }

    profiles[profileIndex] = {
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

    profiles = [...profiles]; // trigger reactivity
    saveProfiles();
    notification.set({
      message: `Profile "${profiles[profileIndex].name}" updated`,
      type: "success",
    });
  }

  function handleDeleteProfile() {
    const profile = profiles.find((p) => p.id === selectedProfileId);
    if (!profile) return;

    if (!confirm(`Are you sure you want to delete "${profile.name}"?`)) {
      return;
    }

    profiles = profiles.filter((p) => p.id !== selectedProfileId);
    saveProfiles();
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
      <div class="text-xs text-neutral-400 text-center py-2 italic">
        No saved profiles yet.
      </div>
    {:else}
      <div class="flex gap-2">
        <select
          bind:value={selectedProfileId}
          class="flex-1 px-2 py-1.5 text-sm border border-neutral-300 dark:border-neutral-600 rounded bg-white dark:bg-neutral-800 focus:ring-2 focus:ring-blue-500 focus:outline-none"
        >
          <option value="" disabled>Select a profile...</option>
          {#each profiles as profile}
            <option value={profile.id}>{profile.name}</option>
          {/each}
        </select>

        <button
          on:click={handleApplyProfile}
          disabled={!selectedProfileId}
          class="px-3 py-1.5 text-xs bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Load settings from selected profile"
        >
          Load
        </button>
      </div>

      {#if selectedProfileId}
        <div class="flex justify-between items-center mt-1 px-1">
          <div class="text-xs text-neutral-400">
            Actions for selected profile:
          </div>
          <div class="flex gap-2">
            <button
              on:click={handleUpdateProfile}
              class="text-xs text-blue-600 dark:text-blue-400 hover:underline"
              title="Overwrite profile with current settings"
            >
              Update from Current
            </button>
            <span class="text-neutral-300 dark:text-neutral-600">|</span>
            <button
              on:click={handleDeleteProfile}
              class="text-xs text-red-600 dark:text-red-400 hover:underline"
            >
              Delete
            </button>
          </div>
        </div>
      {/if}
    {/if}
  </div>
</div>
