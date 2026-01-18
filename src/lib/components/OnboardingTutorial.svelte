<script lang="ts">
  import { onMount } from "svelte";
  import { driver } from "driver.js";
  import "driver.js/dist/driver.css";
  import { startTutorial } from "../../stores";

  export let whatsNewOpen = false;

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
        element: "#path-tab", // This assumes the tab content or the tab button? #path-tab is the button.
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
    },
  });

  // Reactive trigger
  $: if ($startTutorial) {
    // Check if already active to prevent double activation?
    // driver.js usually handles this, but good to be safe.
    if (!driverObj.isActive()) {
      driverObj.drive();
      localStorage.setItem("hasSeenTutorial", "true");
    }
  }

  onMount(() => {
    // We'll handle the auto-start in the reactive statement below
  });

  $: {
    if (!whatsNewOpen) {
      const hasSeen = localStorage.getItem("hasSeenTutorial");
      if (!hasSeen && !$startTutorial) {
        // Small delay to ensure UI is ready
        setTimeout(() => {
          // Check again inside timeout
          if (!localStorage.getItem("hasSeenTutorial") && !whatsNewOpen) {
            startTutorial.set(true);
          }
        }, 1000);
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
