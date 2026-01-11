# Simulation & Playback

Visualize your robot's path with a physics-based simulation. This tool helps you verify timing, check for collisions, and ensure smooth motion before running code on the real robot.

## Playback Controls

Located at the bottom of the screen, the control bar manages the simulation:

*   **Play/Pause**: Start or stop the animation. (Shortcut: `Space`)
*   **Timeline Scrubbing**: Drag the slider to jump to any point in the path.
*   **Speed Control**: Adjust playback speed from **0.25x** (slow motion) to **3.0x** (fast forward).
*   **Loop**: Toggle continuous looping of the animation.

## Visual Aids

Enable these overlays in **Settings** to better understand robot behavior:

*   **Ghost Paths**: Shows a semi-transparent footprint of the robot along the entire path. Useful for checking clearance in tight spaces.
*   **Onion Skinning**: Displays a trail of robot bodies at regular intervals. Helps visualize how the robot rotates and moves through complex curves.
*   **Velocity Heatmap**: Colors the path line based on speed.
    *   **Green**: Fast movement.
    *   **Red**: Slow movement or stopping.

## Physics & Accuracy

The simulation uses your robot's configured constraints to predict real-world performance:

*   **Kinematics**: Accurately models holonomic (omni-directional) movement.
*   **Velocity Limits**: Respects the **Max Velocity** and **Angular Velocity** settings.
*   **Acceleration**: Accounts for **Max Acceleration** to predict realistic travel times.

## Verification Tools

Ensure your path is safe and efficient:

*   **Collision Detection**: Potential collisions with field boundaries or defined obstacles are marked with warning indicators.
*   **Real-time Feedback**: The "Current Robot Position" panel displays live X/Y coordinates and heading during playback.
*   **Event Markers**: Visual dots on the timeline show exactly when events (like "Intake" or "Shoot") will trigger.

---
*Tip: Use the **Stats** button to see the total estimated duration and distance of your routine.*
