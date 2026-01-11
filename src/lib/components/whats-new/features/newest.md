### What's New!

**Features:**

- **Path Statistics:**
  - View detailed metrics including **Total Time**, **Total Distance**, **Max Velocity**, **Max Angular Velocity**, and **Degrees Turned**.
  - Analyze a breakdown of every segment (Path, Wait, Rotate) with per-segment statistics.
  - Copy the full statistics table to your clipboard as Markdown for easy sharing.
- **Rotate Sequence Items:**
  - Added support for explicit **Rotate** commands that use the PedroPathing `turnTo()` method.
  - Rotations now appear in the timeline as **Pink** segments.
  - Supports **Event Markers** on rotation steps (visualized with circular arrows).
  - Includes **Sequential Command** support in exported code.
- **Velocity Heatmap:**
  - Enable the **Velocity Heatmap** in Settings to visualize your robot's speed along the path.
  - The path gradient shifts from Green (slow) to Red (fast), helping you identify bottlenecks or dangerous high-speed sections.
- **Global Event Markers:**
  - Event markers are now managed globally in the **Field Tab**, providing a unified view of all markers across your entire path.
  - The **Obstacles UI** has been updated to match this new cleaner look.
- **Timeline Visualizer 2.0:**
  - Dramatically improved timeline with distinct colors for **Paths (Green)**, **Waits (Amber)**, and **Rotates (Pink)**.
  - Event markers are now clearly visible on the timeline, making it easier to fine-tune timing.
- **Code Export Improvements:**
  - **PedroPathingPlus v1.0.6:** Updated export logic to support the latest library version.
- **Path Validation Tool:**
  - A new "Validate" button checks for **collisions** and **zero-length segments**.
- **What's New Dialog:**
  - Press `Shift + N` to open the new documentation and release notes hub.

**Improvements:**

- **Export & Simulation:**
  - **Reversed Quality Slider:** The GIF export quality slider is now intuitive (Right = Best Quality).
  - **Cancellation:** You can now cancel GIF/APNG generation mid-process.
  - **Timing & Frames:** Removed the frame cap for exports and improved timing accuracy.
  - **External Links:** Links in the app now open in your default browser.
- **User Interface:**
  - **Standardized Colors:** Unified color scheme for event types across the Editor and Timeline.
  - **New Keybinds:** Extensive new keyboard shortcuts for navigation and editing.
  - **Path Optimization:** Access the optimizer directly from the Field view.

## **Bug Fixes:**

- Fixed animation export cancellation support.
- Resolved issues with frame timing in exported GIFs.
- Addressed various UI inconsistencies in the dark theme.
