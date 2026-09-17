<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { DEFAULT_ROBOT_LENGTH, DEFAULT_ROBOT_WIDTH } from "../../../config";
  import type { Settings, RobotFeature } from "../../../types/index";
  import type { WheelSpeeds } from "../../../utils/drivetrain";
  import { ArrowUpIcon, ChevronRightIcon } from "../icons";

  interface Props {
    x: (val: number) => number;
    y: (val: number) => number;
    ppI: number;
    robotXY?: { x: number; y: number } | null;
    robotHeading?: number;
    hoverRobotXY?: { x: number; y: number } | null;
    hoverRobotHeading?: number | null;
    ghostRobotState?: { x: number; y: number; heading: number } | null;
    committedRobotState?: { x: number; y: number; heading: number } | null;
    isDiffMode?: boolean;
    showRobot?: boolean;
    settings: Settings;
    mecanumSpeeds?: WheelSpeeds | null;
    isPlaying?: boolean;
  }

  let {
    x,
    y,
    ppI,
    robotXY = null,
    robotHeading = 0,
    hoverRobotXY = null,
    hoverRobotHeading = null,
    ghostRobotState = null,
    committedRobotState = null,
    isDiffMode = false,
    showRobot = true,
    settings,
    mecanumSpeeds = null,
    isPlaying = false,
  }: Props = $props();

  let turtlePhases = $state({ fl: 0, fr: 0, bl: 0, br: 0, tail: 0 });
  let lastTurtleTime = performance.now();
  let animId: number;

  function speedForWheel(
    wheel: string,
    speeds: WheelSpeeds | null | undefined,
  ): number {
    if (!speeds) return 0;
    return speeds[wheel as keyof WheelSpeeds] || 0;
  }

  function turtleLoop() {
    const now = performance.now();
    const dt = (now - lastTurtleTime) / 1000;
    lastTurtleTime = now;

    if (
      isPlaying &&
      showRobot &&
      settings.robotImage === "turtle" &&
      mecanumSpeeds
    ) {
      const fl = mecanumSpeeds.frontLeft || 0;
      const fr = mecanumSpeeds.frontRight || 0;
      const bl = mecanumSpeeds.backLeft || 0;
      const br = mecanumSpeeds.backRight || 0;
      const total =
        (Math.abs(fl) + Math.abs(fr) + Math.abs(bl) + Math.abs(br)) / 4;
      const WIGGLE_SPEED = 25;

      // Cap the wiggling factors to 1.0 to enforce the maximum flapping cap
      const factorFl = Math.min(1, Math.abs(fr));
      const factorFr = Math.min(1, Math.abs(fl));
      const factorBl = Math.min(1, Math.abs(br));
      const factorBr = Math.min(1, Math.abs(bl));
      const factorTail = Math.min(1, total);

      turtlePhases.fl += dt * factorFl * WIGGLE_SPEED;
      turtlePhases.fr += dt * factorFr * WIGGLE_SPEED;
      turtlePhases.bl += dt * factorBl * WIGGLE_SPEED * 1.3;
      turtlePhases.br += dt * factorBr * WIGGLE_SPEED * 1.3;
      turtlePhases.tail += dt * factorTail * WIGGLE_SPEED * 1.8;
    }

    animId = requestAnimationFrame(turtleLoop);
  }

  onMount(() => {
    animId = requestAnimationFrame(turtleLoop);
  });

  onDestroy(() => {
    cancelAnimationFrame(animId);
  });
</script>

<!-- Robot Features helper for reuse inside different robot representations -->
{#snippet renderRobotFeatures(
  features: RobotFeature[] | undefined,
  baseWidth: number,
  baseHeight: number,
  snippetPpI: number,
)}
  {#if features && features.length > 0}
    <div
      class="absolute inset-0 pointer-events-none"
      style="width: 100%; height: 100%; top: 0; left: 0;"
    >
      <svg
        class="w-full h-full overflow-visible"
        viewBox="0 0 {baseWidth} {baseHeight}"
      >
        {#each features as feature}
          {#if feature.visible !== false}
            {@const px = feature.x * snippetPpI}
            {@const py = feature.y * snippetPpI}
            {@const cx = baseWidth / 2 + px}
            {@const cy = baseHeight / 2 + py}
            {@const fill = feature.filled ? feature.color : "transparent"}
            {@const stroke = feature.color}

            {#if feature.type === "rectangle"}
              <rect
                x={cx - ((feature.width || 4) * snippetPpI) / 2}
                y={cy - ((feature.height || 4) * snippetPpI) / 2}
                width={(feature.width || 4) * snippetPpI}
                height={(feature.height || 4) * snippetPpI}
                {fill}
                {stroke}
                stroke-width={2}
                opacity="0.8"
              />
            {:else if feature.type === "circle"}
              <circle
                {cx}
                {cy}
                r={(feature.radius || 2) * snippetPpI}
                {fill}
                {stroke}
                stroke-width={2}
                opacity="0.8"
              />
            {:else if feature.type === "line"}
              {@const angleRad = ((feature.angle || 0) * Math.PI) / 180}
              {@const len = (feature.length || 6) * snippetPpI}
              <line
                x1={cx}
                y1={cy}
                x2={cx + Math.cos(angleRad) * len}
                y2={cy + Math.sin(angleRad) * len}
                {stroke}
                stroke-width={(feature.thickness || 1) * snippetPpI}
                stroke-linecap="round"
                opacity="0.8"
              />
            {/if}
          {/if}
        {/each}
      </svg>
    </div>
  {/if}
{/snippet}

{#if !isDiffMode && showRobot && robotXY}
  {#if settings.robotImage === "none"}
    <!-- Current (Green Square) -->
    <div
      class="flex items-center justify-center relative shadow-sm"
      style={`overflow: visible; position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; background-color: rgba(34, 197, 94, 0.10); border: 2px solid #16a34a; border-radius: 8px;`}
    >
      {#if settings.showRobotArrows}
        <!-- Mecanum / Swerve wheel arrows -->
        {#each ["frontLeft", "frontRight", "backLeft", "backRight"] as wheel}
          {@const val = speedForWheel(wheel, mecanumSpeeds)}
          {@const isSwerve = settings.robotDriveType === "swerve"}
          {@const arrowSize = isSwerve ? 15 : 10 + Math.abs(val) * 15}
          {@const rot = isSwerve ? val : val >= 0 ? 90 : 270}
          <div
            class="absolute flex justify-center items-center"
            style={`
              width: 24px;
              height: 24px;
              ${wheel.includes("front") ? "top: 4px;" : "bottom: 4px;"}
              ${wheel.includes("Left") ? "left: 4px;" : "right: 4px;"}
              opacity: ${isSwerve ? 0.8 : Math.abs(val) > 0.05 ? 0.8 : 0.2};
            `}
          >
            <ArrowUpIcon
              strokeWidth={3}
              width={arrowSize.toString()}
              height={arrowSize.toString()}
              className="text-green-600"
              style="transform: rotate({rot}deg); transition: transform 0.1s;"
            />
          </div>
        {/each}
      {/if}

      <!-- heading arrow indicator for no-image robot -->
      <div
        style="position:absolute; top:50%; left:50%; transform: translate(-50%, -50%); color: rgba(34, 197, 94, 1.0);"
      >
        <ChevronRightIcon
          className="w-6 h-6"
          strokeWidth={3}
          style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.8));"
        />
      </div>
      {@render renderRobotFeatures(
        settings.robotFeatures,
        Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0)),
        Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0)),
        ppI,
      )}
    </div>
  {:else if settings.robotImage === "turtle"}
    <div
      style={`position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none;`}
    >
      <!-- Turtle Parts Container -->
      <div
        class="relative w-full h-full"
        style="transform: rotate(90deg) scale(1.2);"
      >
        <!-- Tail -->
        <img
          src="/BodyParts/tail.webp"
          alt="Tail"
          class="absolute w-[10%] h-[12%] bottom-[-4%] left-[45%] object-fill"
          style={`transform: rotate(${Math.sin(turtlePhases.tail) * 8}deg); transform-origin: top center;`}
        />

        <!-- Back Left Leg -->
        <img
          src="/BodyParts/backleft.webp"
          alt="Back Left"
          class="absolute w-[15%] h-[27%] bottom-[-5%] left-[20%] object-fill"
          style={`transform: rotate(${Math.cos(turtlePhases.bl) * 10}deg); transform-origin: top center;`}
        />

        <!-- Back Right Leg -->
        <img
          src="/BodyParts/backright.webp"
          alt="Back Right"
          class="absolute w-[15%] h-[27%] bottom-[-5%] right-[20%] object-fill"
          style={`transform: rotate(${Math.sin(turtlePhases.br) * 10}deg); transform-origin: top center;`}
        />

        <!-- Front Left Leg -->
        <div
          class="w-full h-full absolute inset-0"
          style={`transform: rotate(${Math.sin(turtlePhases.fl) * 20}deg);`}
        >
          <img
            src="/BodyParts/frontLeft.webp"
            alt="Front Left"
            class="absolute w-[46%] h-[26%] top-[30%] left-[0%] object-fill"
          />
        </div>

        <!-- Front Right Leg -->
        <div
          class="w-full h-full absolute inset-0"
          style={`transform: rotate(${Math.cos(turtlePhases.fr) * 20}deg);`}
        >
          <img
            src="/BodyParts/FrontRight.webp"
            alt="Front Right"
            class="absolute w-[46%] h-[26%] top-[30%] right-[0%] object-fill"
          />
        </div>

        <!-- Body -->
        <img
          src="/BodyParts/body.webp"
          alt="Body"
          class="absolute w-[58%] h-[93%] left-[21%] top-[3.5%] object-fill z-10"
        />
      </div>
      {@render renderRobotFeatures(
        settings.robotFeatures,
        Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0)),
        Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0)),
        ppI,
      )}
    </div>
  {:else}
    <div
      style={`position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none;`}
    >
      <img
        src={settings.robotImage || "/robot.png"}
        alt="Robot"
        class="w-full h-full object-contain"
        draggable="false"
        onerror={function (e) {
          const target = e.currentTarget || e.target;
          if (target instanceof HTMLImageElement) {
            target.src = "/robot.png";
          }
        }}
      />
      {#if settings.showFakeHeadingArrow && settings.robotImage !== "/robot.png"}
        <div
          style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: {settings.fakeHeadingArrowColor ||
            '#ffffff'};"
        >
          <ChevronRightIcon
            className="w-6 h-6"
            strokeWidth={3}
            style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.8));"
          />
        </div>
      {/if}
      {@render renderRobotFeatures(
        settings.robotFeatures,
        Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0)),
        Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0)),
        ppI,
      )}
    </div>
  {/if}
{:else if isDiffMode}
  <!-- Current (Green) -->
  {#if robotXY}
    <div
      style={`position: absolute; top: ${y(robotXY.y)}px; left: ${x(robotXY.x)}px; transform: translate(-50%, -50%) rotate(${robotHeading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; background-color: rgba(34, 197, 94, 0.5); border: 2px solid #16a34a;`}
    ></div>
  {/if}

  <!-- Committed (Red) -->
  {#if committedRobotState}
    <div
      style={`position: absolute; top: ${y(committedRobotState.y)}px; left: ${x(committedRobotState.x)}px; transform: translate(-50%, -50%) rotate(${committedRobotState.heading}deg); z-index: 20; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; background-color: rgba(239, 68, 68, 0.5); border: 2px solid #dc2626;`}
    ></div>
  {/if}
{/if}

<!-- Timeline Hover Ghost Robot -->
{#if hoverRobotXY && hoverRobotHeading !== null && hoverRobotHeading !== undefined && showRobot && settings.robotImage !== "none" && settings.robotImage !== "turtle"}
  <div
    class="field-element transition-all duration-[20ms] ease-linear pointer-events-none"
    style={`position: absolute; top: ${y(hoverRobotXY.y)}px; left: ${x(hoverRobotXY.x)}px; transform: translate(-50%, -50%) rotate(${hoverRobotHeading}deg); z-index: 21; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; opacity: 0.5;`}
  >
    <img
      src={settings.robotImage || "/robot.png"}
      alt="Hover Ghost Robot"
      class="w-full h-full object-contain pointer-events-none"
      draggable="false"
      style={`filter: drop-shadow(0px 2px 8px rgba(0,0,0,0.4)) ${
        settings.robotImage === "/robot.png"
          ? ""
          : "drop-shadow(0px 0px 4px rgba(255,255,255,0.6))"
      };`}
    />
    {#if settings.showFakeHeadingArrow && settings.robotImage !== "/robot.png"}
      <!-- heading arrow indicator for custom robot image -->
      <div
        class="absolute pointer-events-none"
        style="left: 100%; top: 50%; transform: translate(-10%, -50%);"
      >
        <div
          class="w-0 h-0"
          style="border-top: 6px solid transparent; border-bottom: 6px solid transparent; border-left: 10px solid #16a34a;"
        ></div>
      </div>
    {/if}
    {@render renderRobotFeatures(
      settings.robotFeatures,
      Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0)),
      Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0)),
      ppI,
    )}
  </div>
{:else if hoverRobotXY && hoverRobotHeading !== null && hoverRobotHeading !== undefined && showRobot && (settings.robotImage === "none" || settings.robotImage === "turtle")}
  <div
    class="field-element transition-all duration-[20ms] ease-linear pointer-events-none"
    style={`position: absolute; top: ${y(hoverRobotXY.y)}px; left: ${x(hoverRobotXY.x)}px; transform: translate(-50%, -50%) rotate(${hoverRobotHeading}deg); z-index: 21; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; background-color: rgba(100, 116, 139, 0.3); border: 2px dashed #94a3b8; border-radius: 8px;`}
  >
    <!-- heading arrow indicator for no-image robot -->
    <div
      class="absolute pointer-events-none"
      style="left: 100%; top: 50%; transform: translate(-10%, -50%);"
    >
      <div
        class="w-0 h-0"
        style="border-top: 8px solid transparent; border-bottom: 8px solid transparent; border-left: 12px solid #94a3b8;"
      ></div>
    </div>
    {@render renderRobotFeatures(
      settings.robotFeatures,
      Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0)),
      Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0)),
      ppI,
    )}
  </div>
{/if}

<!-- Telemetry Ghost Robot -->
{#if ghostRobotState}
  <div
    style={`position: absolute; top: ${y(ghostRobotState.y)}px; left: ${x(ghostRobotState.x)}px; transform: translate(-50%, -50%) rotate(${ghostRobotState.heading}deg); z-index: 19; width: ${Math.abs(x(settings.rLength || DEFAULT_ROBOT_LENGTH) - x(0))}px; height: ${Math.abs(x(settings.rWidth || DEFAULT_ROBOT_WIDTH) - x(0))}px; pointer-events: none; border: 2px dashed #6b7280; border-radius: 4px;`}
  >
    {#if settings.robotImage === "none"}
      <div
        class="w-full h-full"
        style="background-color: rgba(107, 114, 128, 0.3);"
      ></div>
    {:else if settings.robotImage === "turtle"}
      <div
        class="relative w-full h-full grayscale opacity-50"
        style="transform: rotate(90deg) scale(1.2);"
      >
        <!-- Tail -->
        <img
          src="/BodyParts/tail.webp"
          alt="Ghost Tail"
          class="absolute w-[10%] h-[12%] bottom-[-4%] left-[45%] object-fill"
          style="transform-origin: top center;"
        />

        <!-- Back Left Leg -->
        <img
          src="/BodyParts/backleft.webp"
          alt="Ghost Back Left"
          class="absolute w-[15%] h-[27%] bottom-[-5%] left-[20%] object-fill"
          style="transform-origin: top center;"
        />

        <!-- Back Right Leg -->
        <img
          src="/BodyParts/backright.webp"
          alt="Ghost Back Right"
          class="absolute w-[15%] h-[27%] bottom-[-5%] right-[20%] object-fill"
          style="transform-origin: top center;"
        />
        <!-- Front Left Leg -->
        <div class="w-full h-full absolute inset-0">
          <img
            src="/BodyParts/frontLeft.webp"
            alt="Ghost Front Left"
            class="absolute w-[46%] h-[26%] top-[30%] left-[0%] object-fill"
          />
        </div>
        <!-- Front Right Leg -->
        <div class="w-full h-full absolute inset-0">
          <img
            src="/BodyParts/FrontRight.webp"
            alt="Ghost Front Right"
            class="absolute w-[46%] h-[26%] top-[30%] right-[0%] object-fill"
          />
        </div>
        <!-- Body -->
        <img
          src="/BodyParts/body.webp"
          alt="Ghost Body"
          class="absolute w-[58%] h-[93%] left-[21%] top-[3.5%] object-fill z-10"
        />
      </div>
    {:else}
      <img
        src={settings.robotImage || "/robot.png"}
        alt="Ghost Robot"
        class="w-full h-full object-contain grayscale opacity-50"
        draggable="false"
        onerror={function (e) {
          const target = e.currentTarget || e.target;
          if (target instanceof HTMLImageElement) {
            target.src = "/robot.png";
          }
        }}
      />
    {/if}
    {#if settings.showFakeHeadingArrow && settings.robotImage !== "/robot.png"}
      <div
        style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: {settings.fakeHeadingArrowColor ||
          '#ffffff'}; opacity: 0.5;"
      >
        <ChevronRightIcon
          className="w-6 h-6"
          strokeWidth={3}
          style="filter: drop-shadow(0px 0px 2px rgba(255,255,255,0.4));"
        />
      </div>
    {/if}
  </div>
{/if}
