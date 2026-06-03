<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import type { Settings, RobotFeature } from "../../../types/index";
  import { PlusIcon, CloseIcon, EyeIcon, EyeSlashIcon } from "../icons";
  import ColorPicker from "../tools/ColorPicker.svelte";

  interface Props {
    settings: Settings;
    onSettingsChange: () => void;
  }

  let { settings = $bindable(), onSettingsChange }: Props = $props();

  if (!settings.robotFeatures) {
    settings.robotFeatures = [];
  }

  let selectedFeatureId = $state<string | null>(null);

  function addFeature(type: RobotFeature["type"]) {
    const newFeature: RobotFeature = {
      id: `feature-${Math.random().toString(36).slice(2)}`,
      name: `New ${type}`,
      type,
      x: 0,
      y: 0,
      color: "#3b82f6",
      filled: true,
      visible: true,
    };

    if (type === "rectangle") {
      newFeature.width = 4;
      newFeature.height = 4;
    } else if (type === "circle") {
      newFeature.radius = 2;
    } else if (type === "line") {
      newFeature.length = 6;
      newFeature.angle = 0;
      newFeature.thickness = 1;
    }

    if (!settings.robotFeatures) settings.robotFeatures = [];
    settings.robotFeatures = [...settings.robotFeatures, newFeature];
    selectedFeatureId = newFeature.id;
    onSettingsChange();
  }

  function removeFeature(id: string) {
    if (!settings.robotFeatures) return;
    settings.robotFeatures = settings.robotFeatures.filter((f) => f.id !== id);
    if (selectedFeatureId === id) selectedFeatureId = null;
    onSettingsChange();
  }

  function updateFeature(id: string, updates: Partial<RobotFeature>) {
    if (!settings.robotFeatures) return;
    settings.robotFeatures = settings.robotFeatures.map((f) =>
      f.id === id ? { ...f, ...updates } : f,
    );
    onSettingsChange();
  }

  // --- Rendering logic for the preview canvas ---
  const PREVIEW_SIZE = 250;
  let maxDim = $derived(
    Math.max(settings.rLength || 18, settings.rWidth || 18),
  );
  let scale = $derived(PREVIEW_SIZE / (maxDim * 1.5)); // Provide 50% margin
  let centerX = PREVIEW_SIZE / 2;
  let centerY = PREVIEW_SIZE / 2;

  let isDragging = false;
  let dragStartMouse = { x: 0, y: 0 };
  let dragStartFeature = { x: 0, y: 0 };
  let activeDragId: string | null = null;

  function handlePointerDown(e: PointerEvent, feature: RobotFeature) {
    if (e.button !== 0) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    selectedFeatureId = feature.id;
    isDragging = true;
    activeDragId = feature.id;
    dragStartMouse = { x: e.clientX, y: e.clientY };
    dragStartFeature = { x: feature.x, y: feature.y };
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDragging || !activeDragId) return;
    const dx = e.clientX - dragStartMouse.x;
    const dy = e.clientY - dragStartMouse.y;

    // The entire preview group is rotated -90 degrees (facing up).
    // Screen up (-dy) maps to local +X (forward). Screen right (+dx) maps to local +Y (left/right).
    const inchX = dragStartFeature.x - dy / scale;
    const inchY = dragStartFeature.y + dx / scale;

    const snap = e.shiftKey ? 0.5 : 0.01;
    updateFeature(activeDragId, {
      x: Math.round(Math.round(inchX / snap) * snap * 100) / 100,
      y: Math.round(Math.round(inchY / snap) * snap * 100) / 100,
    });
  }

  function handlePointerUp(e: PointerEvent) {
    if (isDragging) {
      isDragging = false;
      activeDragId = null;
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    }
  }
</script>

<div
  class="flex flex-col md:flex-row gap-6 mt-2 p-4 bg-neutral-50 dark:bg-neutral-800/30 border border-neutral-200 dark:border-neutral-700 rounded-lg"
>
  <!-- Left Side: Preview Canvas -->
  <div class="flex flex-col w-full md:w-[260px] shrink-0 items-center">
    <div
      class="relative border border-neutral-200 dark:border-neutral-700/50 rounded-md bg-transparent overflow-hidden touch-none"
      style="width: {PREVIEW_SIZE}px; height: {PREVIEW_SIZE}px;"
    >
      <svg width={PREVIEW_SIZE} height={PREVIEW_SIZE} class="w-full h-full">
        <g>
          <!-- Center guidelines -->
          <line
            x1="0"
            y1={centerY}
            x2={PREVIEW_SIZE}
            y2={centerY}
            stroke="#e5e5e5"
            class="dark:stroke-neutral-800"
            stroke-width="1"
            stroke-dasharray="4 4"
          />
          <line
            x1={centerX}
            y1="0"
            x2={centerX}
            y2={PREVIEW_SIZE}
            stroke="#e5e5e5"
            class="dark:stroke-neutral-800"
            stroke-width="1"
            stroke-dasharray="4 4"
          />

          <g transform="rotate(-90, {centerX}, {centerY})">
            <!-- Actual Robot Image (if not none/turtle) -->
            {#if settings.robotImage && settings.robotImage !== "none" && settings.robotImage !== "turtle"}
              <!-- The image is natively oriented facing right. To make it face right, we just use it normally -->
              <image
                href={settings.robotImage === "/robot.png"
                  ? "/robot.png"
                  : settings.robotImage}
                x={centerX - ((settings.rLength || 18) * scale) / 2}
                y={centerY - ((settings.rWidth || 18) * scale) / 2}
                width={(settings.rLength || 18) * scale}
                height={(settings.rWidth || 18) * scale}
                preserveAspectRatio="xMidYMid meet"
                opacity="0.8"
              />
            {/if}

            <!-- Robot Base Boundary -->
            <!-- X is length, Y is width -->
            <rect
              x={centerX - ((settings.rLength || 18) * scale) / 2}
              y={centerY - ((settings.rWidth || 18) * scale) / 2}
              width={(settings.rLength || 18) * scale}
              height={(settings.rWidth || 18) * scale}
              fill="none"
              stroke="#16a34a"
              stroke-width="1.5"
              stroke-dasharray="4 4"
              opacity={settings.robotImage && settings.robotImage !== "none"
                ? "0.5"
                : "1"}
            />

            <!-- Forward indicator (Right-facing) -->
            <polygon
              points="{centerX +
                ((settings.rLength || 18) * scale) / 2 +
                8},{centerY} {centerX +
                ((settings.rLength || 18) * scale) / 2 -
                2},{centerY - 5} {centerX +
                ((settings.rLength || 18) * scale) / 2 -
                2},{centerY + 5}"
              fill="#16a34a"
              opacity={settings.robotImage && settings.robotImage !== "none"
                ? "0.8"
                : "1"}
            />

            <!-- Features -->
            {#if settings.robotFeatures}
              {#each settings.robotFeatures as feature (feature.id)}
                {@const isSelected = selectedFeatureId === feature.id}
                {@const isVisible = feature.visible !== false}
                <!-- X is forward/back, Y is left/right -->
                {@const fx = centerX + feature.x * scale}
                {@const fy = centerY + feature.y * scale}
                {@const strokeColor = isSelected ? "#ef4444" : feature.color}
                {@const strokeWidth = isSelected ? 3 : 1}
                {@const fill = feature.filled ? feature.color : "transparent"}
                {@const opacity = !isVisible
                  ? 0.3
                  : feature.filled
                    ? isSelected
                      ? 0.9
                      : 0.7
                    : 1}

                {#if isVisible || isSelected}
                  <g
                    role="img"
                    aria-label="Robot feature"
                    onpointerdown={(e) => handlePointerDown(e, feature)}
                    onpointermove={handlePointerMove}
                    onpointerup={handlePointerUp}
                    onpointercancel={handlePointerUp}
                    class="cursor-move"
                    style="outline: none;"
                  >
                    {#if feature.type === "rectangle"}
                      <rect
                        x={fx - ((feature.width || 4) * scale) / 2}
                        y={fy - ((feature.height || 4) * scale) / 2}
                        width={(feature.width || 4) * scale}
                        height={(feature.height || 4) * scale}
                        {fill}
                        stroke={strokeColor}
                        stroke-width={strokeWidth}
                        {opacity}
                      />
                    {:else if feature.type === "circle"}
                      <circle
                        cx={fx}
                        cy={fy}
                        r={(feature.radius || 2) * scale}
                        {fill}
                        stroke={strokeColor}
                        stroke-width={strokeWidth}
                        {opacity}
                      />
                    {:else if feature.type === "line"}
                      {@const angleRad = ((feature.angle || 0) * Math.PI) / 180}
                      {@const len = (feature.length || 6) * scale}
                      {@const endX = fx + Math.cos(angleRad) * len}
                      {@const endY = fy + Math.sin(angleRad) * len}
                      <line
                        x1={fx}
                        y1={fy}
                        x2={endX}
                        y2={endY}
                        stroke={feature.color}
                        stroke-width={(feature.thickness || 1) * scale}
                        {opacity}
                      />
                      {#if isSelected}
                        <!-- Selection highlight for line -->
                        <line
                          x1={fx}
                          y1={fy}
                          x2={endX}
                          y2={endY}
                          stroke="#ef4444"
                          stroke-width={(feature.thickness || 1) * scale + 4}
                          opacity="0.3"
                        />
                        <!-- Anchor point marker -->
                        <circle cx={fx} cy={fy} r="4" fill="#ef4444" />
                      {/if}
                    {/if}
                  </g>
                {/if}
              {/each}
            {/if}
          </g>
        </g>
      </svg>
    </div>
    <div
      class="text-[10px] text-neutral-400 dark:text-neutral-500 text-center w-full mt-1"
    >
      Drag features to move them, or edit properties below. Shift-drag to snap.
    </div>
  </div>

  <!-- Right Side: Properties Editor -->
  <div class="flex flex-col w-full min-w-0 flex-1">
    <div
      class="text-xs font-medium text-neutral-500 uppercase flex justify-between items-center mb-2"
    >
      <span>Properties</span>
      {#if settings.robotFeatures && settings.robotFeatures.length > 0}
        <span class="text-[10px]">{settings.robotFeatures.length} features</span
        >
      {/if}
    </div>

    <!-- Add Buttons -->
    <div class="flex gap-2 mb-3">
      <button
        class="px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded border border-neutral-300 dark:border-neutral-600 transition-colors flex items-center gap-1"
        onclick={() => addFeature("rectangle")}
      >
        <PlusIcon className="w-3 h-3" /> Rect
      </button>
      <button
        class="px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded border border-neutral-300 dark:border-neutral-600 transition-colors flex items-center gap-1"
        onclick={() => addFeature("circle")}
      >
        <PlusIcon className="w-3 h-3" /> Circle
      </button>
      <button
        class="px-2 py-1 text-xs bg-neutral-100 hover:bg-neutral-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded border border-neutral-300 dark:border-neutral-600 transition-colors flex items-center gap-1"
        onclick={() => addFeature("line")}
      >
        <PlusIcon className="w-3 h-3" /> Line
      </button>
    </div>

    {#if !settings.robotFeatures || settings.robotFeatures.length === 0}
      <div
        class="flex flex-col items-center justify-center h-[250px] border border-dashed border-neutral-300 dark:border-neutral-700 rounded-md text-sm text-neutral-500 bg-neutral-50 dark:bg-neutral-800/50 p-4 text-center"
      >
        <div class="mb-2 opacity-50">
          <PlusIcon className="w-8 h-8 mx-auto" />
        </div>
        <p class="font-medium text-neutral-600 dark:text-neutral-400">
          No custom features set
        </p>
      </div>
    {:else}
      <div
        class="flex flex-col h-[250px] overflow-y-auto pr-1 gap-2 custom-scrollbar"
      >
        {#each settings.robotFeatures as feature (feature.id)}
          <div
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Enter" || e.key === " ")
                selectedFeatureId = feature.id;
            }}
            class="flex flex-col gap-2 p-3 rounded-md border {selectedFeatureId ===
            feature.id
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800'}"
            onclick={() => (selectedFeatureId = feature.id)}
          >
            <div class="flex justify-between items-center">
              <input
                type="text"
                value={feature.name}
                oninput={(e) =>
                  updateFeature(feature.id, { name: e.currentTarget.value })}
                class="text-sm font-medium bg-transparent border-none focus:ring-1 focus:ring-blue-500 rounded px-1 -ml-1 w-2/3 text-neutral-800 dark:text-neutral-200"
              />
              <div class="flex items-center gap-1">
                <button
                  class="text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors p-1"
                  onclick={(e) => {
                    e.stopPropagation();
                    updateFeature(feature.id, {
                      visible: feature.visible === false ? true : false,
                    });
                  }}
                  title={feature.visible === false
                    ? "Show Feature"
                    : "Hide Feature"}
                  aria-label={feature.visible === false
                    ? "Show Feature"
                    : "Hide Feature"}
                >
                  {#if feature.visible === false}
                    <EyeSlashIcon className="w-4 h-4" />
                  {:else}
                    <EyeIcon className="w-4 h-4" />
                  {/if}
                </button>
                <button
                  class="text-neutral-400 hover:text-red-500 transition-colors p-1"
                  onclick={(e) => {
                    e.stopPropagation();
                    removeFeature(feature.id);
                  }}
                  title="Remove Feature"
                  aria-label="Remove Feature"
                >
                  <CloseIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div class="grid grid-cols-2 gap-2 mt-1">
              <!-- Common Properties -->
              <div class="flex flex-col">
                <label
                  for="feature-{feature.id}-x"
                  class="text-[10px] text-neutral-500 uppercase"
                  >X Offset (in)</label
                >
                <input
                  id="feature-{feature.id}-x"
                  type="number"
                  value={feature.x}
                  oninput={(e) =>
                    updateFeature(feature.id, {
                      x: Number.parseFloat(e.currentTarget.value) || 0,
                    })}
                  step="0.01"
                  class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div class="flex flex-col">
                <label
                  for="feature-{feature.id}-y"
                  class="text-[10px] text-neutral-500 uppercase"
                  >Y Offset (in)</label
                >
                <input
                  id="feature-{feature.id}-y"
                  type="number"
                  value={feature.y}
                  oninput={(e) =>
                    updateFeature(feature.id, {
                      y: Number.parseFloat(e.currentTarget.value) || 0,
                    })}
                  step="0.01"
                  class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <!-- Shape-specific Properties -->
              {#if feature.type === "rectangle"}
                <div class="flex flex-col">
                  <label
                    for="feature-{feature.id}-width"
                    class="text-[10px] text-neutral-500 uppercase"
                    >Width (in)</label
                  >
                  <input
                    id="feature-{feature.id}-width"
                    type="number"
                    value={feature.width}
                    oninput={(e) =>
                      updateFeature(feature.id, {
                        width: Math.max(
                          0.1,
                          Number.parseFloat(e.currentTarget.value) || 4,
                        ),
                      })}
                    min="0.1"
                    step="0.01"
                    class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div class="flex flex-col">
                  <label
                    for="feature-{feature.id}-height"
                    class="text-[10px] text-neutral-500 uppercase"
                    >Height (in)</label
                  >
                  <input
                    id="feature-{feature.id}-height"
                    type="number"
                    value={feature.height}
                    oninput={(e) =>
                      updateFeature(feature.id, {
                        height: Math.max(
                          0.1,
                          Number.parseFloat(e.currentTarget.value) || 4,
                        ),
                      })}
                    min="0.1"
                    step="0.01"
                    class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              {:else if feature.type === "circle"}
                <div class="flex flex-col">
                  <label
                    for="feature-{feature.id}-radius"
                    class="text-[10px] text-neutral-500 uppercase"
                    >Radius (in)</label
                  >
                  <input
                    id="feature-{feature.id}-radius"
                    type="number"
                    value={feature.radius}
                    oninput={(e) =>
                      updateFeature(feature.id, {
                        radius: Math.max(
                          0.1,
                          Number.parseFloat(e.currentTarget.value) || 2,
                        ),
                      })}
                    min="0.1"
                    step="0.01"
                    class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              {:else if feature.type === "line"}
                <div class="flex flex-col">
                  <label
                    for="feature-{feature.id}-length"
                    class="text-[10px] text-neutral-500 uppercase"
                    >Length (in)</label
                  >
                  <input
                    id="feature-{feature.id}-length"
                    type="number"
                    value={feature.length}
                    oninput={(e) =>
                      updateFeature(feature.id, {
                        length: Math.max(
                          0.1,
                          Number.parseFloat(e.currentTarget.value) || 6,
                        ),
                      })}
                    min="0.1"
                    step="0.01"
                    class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div class="flex flex-col">
                  <label
                    for="feature-{feature.id}-angle"
                    class="text-[10px] text-neutral-500 uppercase"
                    >Angle (deg)</label
                  >
                  <input
                    id="feature-{feature.id}-angle"
                    type="number"
                    value={feature.angle}
                    oninput={(e) =>
                      updateFeature(feature.id, {
                        angle: Number.parseFloat(e.currentTarget.value) || 0,
                      })}
                    step="5"
                    class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div class="flex flex-col col-span-2">
                  <label
                    for="feature-{feature.id}-thickness"
                    class="text-[10px] text-neutral-500 uppercase"
                    >Thickness (in)</label
                  >
                  <input
                    id="feature-{feature.id}-thickness"
                    type="number"
                    value={feature.thickness}
                    oninput={(e) =>
                      updateFeature(feature.id, {
                        thickness: Math.max(
                          0.1,
                          Number.parseFloat(e.currentTarget.value) || 1,
                        ),
                      })}
                    min="0.1"
                    step="0.01"
                    class="w-full px-2 py-1 text-sm rounded border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              {/if}

              <!-- Color -->
              <div class="flex flex-col col-span-1">
                <label
                  for="feature-{feature.id}-color"
                  class="text-[10px] text-neutral-500 uppercase">Color</label
                >
                <div class="flex items-center gap-2 mt-1">
                  <ColorPicker
                    color={feature.color}
                    onchange={(e) =>
                      updateFeature(feature.id, {
                        color: (e.currentTarget as HTMLInputElement).value,
                      })}
                  />
                </div>
              </div>

              {#if feature.type !== "line"}
                <div class="flex flex-col justify-end col-span-1">
                  <label
                    for="feature-{feature.id}-filled"
                    class="flex items-center gap-2 text-sm cursor-pointer"
                  >
                    <input
                      id="feature-{feature.id}-filled"
                      type="checkbox"
                      checked={feature.filled}
                      onchange={(e) =>
                        updateFeature(feature.id, {
                          filled: e.currentTarget.checked,
                        })}
                      class="rounded text-blue-500 focus:ring-blue-500"
                    />
                    <span class="text-neutral-700 dark:text-neutral-300"
                      >Filled</span
                    >
                  </label>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
