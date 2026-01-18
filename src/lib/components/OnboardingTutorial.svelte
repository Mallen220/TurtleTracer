<script lang="ts">
  import { createEventDispatcher } from "svelte";
  import { driver } from "driver.js";
  import "driver.js/dist/driver.css";
  import { startTutorial } from "../../stores";
  import { settingsStore } from "../projectStore";

  export let whatsNewOpen = false;
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
          title: "Welcome to Pedro Pathing Visualizer!",
          description:
            "This is your main workspace. Here you can visualize your robot's path and field obstacles. Double-click to add points.",
          side: "left",
          align: "start",
        },
      },
      {
        element: "#file-manager-btn",
        popover: {
          title: "File Manager",
          description:
            "Open the File Manager to browse, organize, and open your saved projects.",
          side: "bottom",
          align: "start",
        },
      },
      {
        element: "#tab-switcher",
        popover: {
          title: "Edit Modes",
          description:
            "Switch between <b>Paths</b> (editing curves), <b>Field</b> (adding obstacles), and <b>Table</b> (data view).",
          side: "bottom",
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
        element: "#new-project-btn",
        popover: {
          title: "New Project",
          description:
            "Click here to start a fresh project. This will clear the current path.",
          side: "bottom",
          align: "end",
        },
      },
      {
        element: "#save-project-btn",
        popover: {
          title: "Save Project",
          description:
            "Save your work to a .pp file on your computer. You can also 'Save As' to create a copy.",
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
        element: "#settings-btn",
        popover: {
          title: "Settings",
          description:
            "Configure robot dimensions, field background, theme, and other preferences.",
          side: "bottom",
          align: "end",
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
      // Mark as seen immediately when started, or should we wait for completion?
      // Usually marking as seen on start is safer to avoid loops if they crash or exit early
      // but 'hasSeenOnboarding' implies we don't need to force it again.
      // We update the settings store.
      settingsStore.update(s => ({...s, hasSeenOnboarding: true}));
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
      } else if (!whatsNewOpen) {
        const hasSeen = $settingsStore.hasSeenOnboarding;
        if (!hasSeen && !$startTutorial) {
          // Small delay to ensure UI is ready
          setTimeout(() => {
            // Check again inside timeout, using the store value
            // We need to re-fetch or use logic that accesses current store state
            // But this block is reactive to $settingsStore via 'hasSeen' above.
            // If hasSeen becomes true, this block re-runs but the condition !hasSeen fails.
            // So we are good.
            // Double check store value here just in case of race condition during timeout
            let currentSeen = false;
            const unsubscribe = settingsStore.subscribe(s => currentSeen = !!s.hasSeenOnboarding);
            unsubscribe();

            if (!currentSeen && !whatsNewOpen) {
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
