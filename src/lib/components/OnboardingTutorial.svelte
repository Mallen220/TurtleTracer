<!-- Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0. -->
<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { driver } from "driver.js";
  import "driver.js/dist/driver.css";
  import { startTutorial } from "../../stores";
  import { settingsStore } from "../projectStore";

  export let whatsNewOpen = false;
  export let setupDialogOpen = false;
  export let isLoaded = false;

  const dispatch = createEventDispatcher();

  // Dev flag to force start tutorial
  const FORCE_START_DEV = false;

  let isFirstRun = false;

  // Use a customized theme for the driver.js overlay
  const driverObj = driver({
    showProgress: true,
    animate: true,
    allowClose: true,
    doneBtnText: "Done",
    nextBtnText: "Next",
    prevBtnText: "Previous",
    steps: [
      {
        element: "#field-container",
        popover: {
          title: "Welcome to Turtle Tracer!",
          description:
            "This is your main workspace. Here you can visualize your robot's path and field obstacles. Double-click to add points.",
          side: "bottom",
          align: "center",
        },
      },
      {
        element: "#sidebar-file-manager-btn",
        popover: {
          title: "File Manager",
          description:
            "Open the File Manager to browse, organize, and open your saved projects.",
          side: "right",
          align: "center",
        },
      },
      {
        element: "#tab-switcher",
        popover: {
          title: "Edit Modes",
          description:
            "Switch between <b>Paths</b> (editing curves), <b>Field</b> (adding obstacles), and <b>Table</b> (data view).",
          side: "left",
          align: "start",
        },
      },
      {
        element: "#path-tab",
        popover: {
          title: "Path Tools",
          description:
            "Use the Path tab to adjust settings for your selected path chain, add wait commands, or change heading interpolation.",
          side: "left",
          align: "start",
        },
      },
      {
        element: "#playback-controls",
        popover: {
          title: "Simulation Timeline",
          description:
            "Control the playback of your autonomous routine. You can play, pause, loop, and drag the slider to scrub through time.",
          side: "top",
          align: "center",
        },
      },
      {
        element: "#sidebar-new-path-btn",
        popover: {
          title: "New Project",
          description:
            "Click here to start a fresh project. This will clear the current path.",
          side: "right",
          align: "center",
        },
      },
      {
        element: "#save-project-btn",
        popover: {
          title: "Save Project",
          description:
            "Save your work to a .turt file on your computer. Legacy .pp files are still supported.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "#export-project-btn",
        popover: {
          title: "Export Code",
          description:
            "Generate the Java code needed for your robot, or export to other formats like JSON.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "#sidebar-settings-btn",
        popover: {
          title: "Settings",
          description:
            "Configure robot dimensions, field background, theme, and other preferences.",
          side: "right",
          align: "center",
        },
      },
    ],
    onDestroyStarted: () => {
      // Logic when user tries to exit or finishes
      if (driverObj.isActive()) {
        driverObj.destroy();
      }
      // Reset store so it can be triggered again later
      startTutorial.set(false);

      // If this was the initial first-run tutorial, trigger the "What's New" / Docs
      if (isFirstRun) {
        isFirstRun = false;
        dispatch("tutorialComplete");
      }
    },
  });

  // Reactive trigger
  $: if ($startTutorial) {
    if (!driverObj.isActive()) {
      driverObj.drive();
      settingsStore.update((s) => ({ ...s, hasSeenOnboarding: true }));
    }
  }

  // Auto-start logic
  $: {
    // Only check if loaded
    if (isLoaded) {
      if (FORCE_START_DEV && !$startTutorial) {
        setTimeout(() => {
          isFirstRun = true;
          startTutorial.set(true);
        }, 500);
      } else if (!whatsNewOpen && !setupDialogOpen) {
        const hasSeen = $settingsStore.hasSeenOnboarding;
        if (!hasSeen && !$startTutorial) {
          // Small delay to ensure UI is ready
          setTimeout(() => {
            let currentSeen = false;
            const unsubscribe = settingsStore.subscribe(
              (s) => (currentSeen = !!s.hasSeenOnboarding),
            );
            unsubscribe();
 
            if (!currentSeen && !whatsNewOpen && !setupDialogOpen) {
              isFirstRun = true;
              startTutorial.set(true);
            }
          }, 1000);
        }
      }
    }
  }
</script>

<style>
  /* Optional overrides for driver.js if needed */
  :global(.driver-popover.driverjs-theme) {
    background-color: #ffffff;
    color: #000000;
  }
  :global(.dark .driver-popover.driverjs-theme) {
    background-color: #1f2937;
    color: #ffffff;
  }
</style>
