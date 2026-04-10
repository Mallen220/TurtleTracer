<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import SettingsItem from "../../dialogs/SettingsItem.svelte";
  import { DEFAULT_SETTINGS } from "../../../../config/defaults";
  import type { Settings } from "../../../../types/index";
  import RobotProfileManager from "../../settings/RobotProfileManager.svelte";
  import { notification } from "../../../../stores";
  import { CloseIcon, RobotPlaceholderIcon } from "../../icons";

  interface Props {
    settings: Settings;
    searchQuery: string;
  }

  let { settings = $bindable(), searchQuery }: Props = $props();

  function handleNumberInput(
    value: string,
    property: keyof Settings,
    min?: number,
    max?: number,
    restoreDefaultIfEmpty = false,
  ) {
    if (value === "" && restoreDefaultIfEmpty) {
      (settings as any)[property] = DEFAULT_SETTINGS[property];
      settings = { ...settings };
      return;
    }
    let num = Number.parseFloat(value);
    if (Number.isNaN(num)) num = 0;
    if (min !== undefined) num = Math.max(min, num);
    if (max !== undefined) num = Math.min(max, num);
    (settings as any)[property] = num;
    settings = { ...settings };
  }

  function handleLengthInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "rLength",
      1,
      36,
      true,
    );
  }
  function handleWidthInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "rWidth",
      1,
      36,
      true,
    );
  }
  function handleSafetyMarginInput(e: Event) {
    handleNumberInput(
      (e.target as HTMLInputElement).value,
      "safetyMargin",
      0,
      24,
      true,
    );
  }

  function handleImageError(e: Event) {
    const target = e.target as HTMLImageElement;
    target.src = "/robot.png";
  }

  function imageToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert image"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(e: Event) {
    const target = e.target as HTMLInputElement;
    const file = target.files?.[0];
    if (file) {
      try {
        const base64 = await imageToBase64(file);
        settings.robotImage = base64;
        settings = { ...settings };
        notification.set({
          message: "Robot image updated!",
          type: "success",
          timeout: 3000,
        });
      } catch (error) {
        notification.set({
          message: "Error loading image: " + (error as Error).message,
          type: "error",
        });
      }
    }
  }
</script>

<div class="section-container mb-8">
  {#if searchQuery}
    <h4
      class="text-xs font-bold text-neutral-500 uppercase tracking-wider mb-4 border-b border-neutral-100 dark:border-neutral-800 pb-1"
    >
      Robot
    </h4>
  {/if}

  <SettingsItem
    label="Robot Profiles"
    description="Save and load robot configurations"
    {searchQuery}
    section
  >
    <RobotProfileManager
      {settings}
      onSettingsChange={() => (settings = { ...settings })}
    />
  </SettingsItem>

  <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
    <SettingsItem
      label="Robot Length (in)"
      isModified={settings.rLength !== DEFAULT_SETTINGS.rLength}
      onReset={() => {
        settings.rLength = DEFAULT_SETTINGS.rLength;
        settings = { ...settings };
      }}
      description="Length of the robot base"
      {searchQuery}
      forId="robot-length"
    >
      <input
        id="robot-length"
        type="number"
        value={settings.rLength}
        oninput={(e) => {
          settings.rLength = Number.parseFloat(e.currentTarget.value) || 0;
          settings = { ...settings };
        }}
        min="1"
        max="36"
        step="0.5"
        onchange={handleLengthInput}
        class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </SettingsItem>
    <SettingsItem
      label="Robot Width (in)"
      isModified={settings.rWidth !== DEFAULT_SETTINGS.rWidth}
      onReset={() => {
        settings.rWidth = DEFAULT_SETTINGS.rWidth;
        settings = { ...settings };
      }}
      description="Width of the robot base"
      {searchQuery}
      forId="robot-width"
    >
      <input
        id="robot-width"
        type="number"
        value={settings.rWidth}
        oninput={(e) => {
          settings.rWidth = Number.parseFloat(e.currentTarget.value) || 0;
          settings = { ...settings };
        }}
        min="1"
        max="36"
        step="0.5"
        onchange={handleWidthInput}
        class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </SettingsItem>
  </div>

  <SettingsItem
    label="Disable Validation"
    isModified={settings.validationDisabled !==
      DEFAULT_SETTINGS.validationDisabled}
    onReset={() => {
      settings.validationDisabled = DEFAULT_SETTINGS.validationDisabled;
      settings = { ...settings };
    }}
    description="Turn off all path validation"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.validationDisabled}
      onchange={(e) => {
        settings.validationDisabled = e.currentTarget.checked;
        settings = { ...settings };
      }}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
  </SettingsItem>

  {#if !settings.validationDisabled}
    <SettingsItem
      label="Safety Margin (in)"
      isModified={settings.safetyMargin !== DEFAULT_SETTINGS.safetyMargin}
      onReset={() => {
        settings.safetyMargin = DEFAULT_SETTINGS.safetyMargin;
        settings = { ...settings };
      }}
      description="Buffer around obstacles and field boundaries"
      {searchQuery}
      forId="safety-margin"
    >
      <input
        id="safety-margin"
        type="number"
        value={settings.safetyMargin}
        oninput={(e) => {
          settings.safetyMargin = Number.parseFloat(e.currentTarget.value) || 0;
          settings = { ...settings };
        }}
        min="0"
        max="24"
        step="0.5"
        onchange={handleSafetyMarginInput}
        class="w-full px-3 py-2 rounded-md border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </SettingsItem>

    <SettingsItem
      label="Validate Field Boundaries"
      isModified={settings.validateFieldBoundaries !==
        DEFAULT_SETTINGS.validateFieldBoundaries}
      onReset={() => {
        settings.validateFieldBoundaries =
          DEFAULT_SETTINGS.validateFieldBoundaries;
        settings = { ...settings };
      }}
      description="Warn if robot exits the field"
      {searchQuery}
      layout="row"
    >
      <input
        type="checkbox"
        checked={settings.validateFieldBoundaries}
        onchange={(e) => {
          settings.validateFieldBoundaries = e.currentTarget.checked;
          settings = { ...settings };
        }}
        class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
      />
    </SettingsItem>

    <SettingsItem
      label="Continuous Validation"
      isModified={settings.continuousValidation !==
        DEFAULT_SETTINGS.continuousValidation}
      onReset={() => {
        settings.continuousValidation = DEFAULT_SETTINGS.continuousValidation;
        settings = { ...settings };
      }}
      description="Show validation issues as you work"
      {searchQuery}
      layout="row"
    >
      <input
        type="checkbox"
        checked={settings.continuousValidation}
        onchange={(e) => {
          settings.continuousValidation = e.currentTarget.checked;
          settings = { ...settings };
        }}
        class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
      />
    </SettingsItem>
  {/if}

  <SettingsItem
    label="Restrict Dragging"
    isModified={settings.restrictDraggingToField !==
      DEFAULT_SETTINGS.restrictDraggingToField}
    onReset={() => {
      settings.restrictDraggingToField =
        DEFAULT_SETTINGS.restrictDraggingToField;
      settings = { ...settings };
    }}
    description="Keep points inside field bounds"
    {searchQuery}
    layout="row"
  >
    <input
      type="checkbox"
      checked={settings.restrictDraggingToField}
      onchange={(e) => {
        settings.restrictDraggingToField = e.currentTarget.checked;
        settings = { ...settings };
      }}
      class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
    />
  </SettingsItem>

  <SettingsItem
    label="Robot Image"
    isModified={settings.robotImage !== DEFAULT_SETTINGS.robotImage ||
      settings.robotDriveType !== DEFAULT_SETTINGS.robotDriveType ||
      settings.showRobotArrows !== DEFAULT_SETTINGS.showRobotArrows}
    onReset={() => {
      settings.robotImage = DEFAULT_SETTINGS.robotImage;
      settings.robotDriveType = DEFAULT_SETTINGS.robotDriveType;
      settings.showRobotArrows = DEFAULT_SETTINGS.showRobotArrows;
      settings = { ...settings };
    }}
    description="Upload a custom image for your robot"
    {searchQuery}
    section
  >
    <div
      class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
    >
      Robot Image
      <div
        class="text-xs text-neutral-500 dark:text-neutral-400 font-normal mt-0.5"
      >
        Upload a custom image for your robot
      </div>
    </div>
    <div
      class="flex flex-col items-center gap-3 p-4 border border-neutral-300 dark:border-neutral-700 rounded-md bg-neutral-50 dark:bg-neutral-800/50"
    >
      <!-- Image Preview & Controls (Same as original) -->
      <div
        class="relative w-24 h-24 border-2 border-neutral-300 dark:border-neutral-600 rounded-md overflow-hidden bg-white dark:bg-neutral-900"
      >
        {#if settings.robotImage && settings.robotImage !== "none"}
          <img
            src={settings.robotImage}
            alt="Robot Preview"
            class="w-full h-full object-contain"
            onerror={(e) => {
              console.error("Failed to load robot image:", settings.robotImage);
              handleImageError(e);
            }}
          />
        {:else}
          <!-- show the green square with directional arrows when no-image mode is active -->
          <div class="w-full h-full flex items-center justify-center">
            <RobotPlaceholderIcon className="w-[80%] h-[80%]" />
          </div>
        {/if}
        {#if settings.robotImage && settings.robotImage !== "/robot.png" && settings.robotImage !== "none"}
          <button
            onclick={() => {
              settings.robotImage = "/robot.png";
              settings = { ...settings };
            }}
            class="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
          >
            <CloseIcon className="size-3" strokeWidth={3} />
          </button>
        {/if}
      </div>
      <div class="text-center text-xs text-neutral-600 dark:text-neutral-400">
        {#if settings.robotImage === "none"}
          <p>No robot image selected (default)</p>
        {:else if settings.robotImage && settings.robotImage !== "/robot.png"}
          <p class="font-medium">
            {#if settings.robotImage === "/JefferyThePotato.png"}
              🥔 Jeffery the Potato Active! 🥔
            {:else}
              Custom Image Loaded
            {/if}
          </p>
        {:else}
          <p>Using lightweight default image</p>
        {/if}
      </div>
      <div class="flex flex-wrap justify-center gap-2 w-full">
        <input
          id="robot-image-input"
          type="file"
          accept="image/*"
          class="hidden"
          tabindex="-1"
          onchange={handleImageUpload}
        />
        <button
          onclick={() => {
            settings.robotImage = "none";
            settings = { ...settings };
          }}
          class="px-3 py-1.5 text-xs bg-red-500 hover:bg-red-600 text-white rounded-md transition-colors"
          disabled={settings.robotImage === "none"}
        >
          No Image (Recommended)
        </button>
        <button
          onclick={() => {
            settings.robotImage = "/robot.png";
            settings = { ...settings };
          }}
          class="px-3 py-1.5 text-xs bg-neutral-500 hover:bg-neutral-600 text-white rounded-md transition-colors"
          disabled={!settings.robotImage ||
            settings.robotImage === "/robot.png"}
        >
          Lightweight Image
        </button>
        <button
          onclick={() => {
            settings.robotImage = "/JefferyThePotato.png";
            settings = { ...settings };
          }}
          class="potato-tooltip px-3 py-1.5 text-xs bg-amber-700 hover:bg-amber-800 text-white rounded-md transition-colors flex items-center gap-1 overflow-hidden relative"
          style="background-image: linear-gradient(45deg, #a16207 25%, #ca8a04 25%, #ca8a04 50%, #a16207 50%, #a16207 75%, #ca8a04 75%, #ca8a04 100%); background-size: 20px 20px;"
        >
          <span>🥔</span> Use Potato Robot
        </button>
        <button
          onclick={() => document.getElementById("robot-image-input")?.click()}
          class="px-3 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-md transition-colors"
        >
          Upload Custom
        </button>
      </div>

      {#if settings.robotImage === "none" || !settings.robotImage}
        <div
          class="w-full border-t border-neutral-300 dark:border-neutral-700 pt-3 mt-1"
        >
          <p
            id="drive-train-label"
            class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1"
          >
            Drive Train Visualization
          </p>
          <div
            role="group"
            aria-labelledby="drive-train-label"
            class="flex gap-2"
          >
            <button
              class="px-3 py-1.5 text-sm rounded-md transition-colors
                              {settings.robotDriveType === 'holonomic'
                ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-500 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}"
              onclick={() => {
                settings.robotDriveType = "holonomic";
                settings = { ...settings };
              }}
            >
              Holonomic
            </button>
            <button
              class="px-3 py-1.5 text-sm rounded-md transition-colors
                              {settings.robotDriveType === 'swerve'
                ? 'bg-blue-100 dark:bg-blue-900/30 border border-blue-500 text-blue-700 dark:text-blue-300'
                : 'bg-white dark:bg-neutral-800 border border-neutral-300 dark:border-neutral-600 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-700'}"
              onclick={() => {
                settings.robotDriveType = "swerve";
                settings = { ...settings };
              }}
            >
              Swerve
            </button>
          </div>
        </div>
        <div
          class="w-full flex justify-between items-center mt-3 pt-3 border-t border-neutral-200 dark:border-neutral-700"
        >
          <div>
            <p
              class="text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Show Wheel Arrows
            </p>
            <p class="text-xs text-neutral-500 dark:text-neutral-400">
              Display arrows indicating wheel speeds/directions based on drive
              train type
            </p>
          </div>
          <input
            type="checkbox"
            checked={settings.showRobotArrows}
            onchange={(e) => {
              settings.showRobotArrows = e.currentTarget.checked;
              settings = { ...settings };
            }}
            class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          />
        </div>
      {/if}
    </div>
  </SettingsItem>

  {#if settings.robotImage && settings.robotImage !== "/robot.png" && settings.robotImage !== "none"}
    <div class="space-y-2">
      <SettingsItem
        label="Show Fake Heading Arrow"
        isModified={settings.showFakeHeadingArrow !==
          DEFAULT_SETTINGS.showFakeHeadingArrow}
        onReset={() => {
          settings.showFakeHeadingArrow = DEFAULT_SETTINGS.showFakeHeadingArrow;
          settings = { ...settings };
        }}
        description="Display an arrow indicating the robot's heading to help with custom images"
        {searchQuery}
        layout="row"
      >
        <input
          type="checkbox"
          checked={settings.showFakeHeadingArrow}
          onchange={(e) => {
            settings.showFakeHeadingArrow = e.currentTarget.checked;
            settings = { ...settings };
          }}
          class="w-5 h-5 rounded border-neutral-300 dark:border-neutral-600 text-blue-500 focus:ring-2 focus:ring-blue-500 cursor-pointer"
        />
      </SettingsItem>

      {#if settings.showFakeHeadingArrow}
        <SettingsItem
          label="Heading Arrow Color"
          isModified={settings.fakeHeadingArrowColor !==
            DEFAULT_SETTINGS.fakeHeadingArrowColor}
          onReset={() => {
            settings.fakeHeadingArrowColor =
              DEFAULT_SETTINGS.fakeHeadingArrowColor;
            settings = { ...settings };
          }}
          description="Color of the fake heading arrow"
          {searchQuery}
          layout="row"
        >
          <input
            type="color"
            value={settings.fakeHeadingArrowColor}
            oninput={(e) => {
              settings.fakeHeadingArrowColor = e.currentTarget.value;
              settings = { ...settings };
            }}
            class="w-8 h-8 rounded border border-neutral-300 dark:border-neutral-600 cursor-pointer p-0"
          />
        </SettingsItem>
      {/if}
    </div>
  {/if}
</div>
