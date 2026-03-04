### What's New!

## **Features:**

- **Section Looping:** You can now loop a specific section of your path! Previously known as "A/B looping," this feature lets you set custom start and end points for continuous playback of a selected segment, and is now enabled by default.
- **Precision Tuning Shortcuts:** Added new keybindings (`Shift` + `+` / `=`) to increase and (`Shift` + `-` / `_`) to decrease values by smaller increments. This is perfect for fine-tuning event markers, rotations, and wait times without disrupting existing controls.
- **View Options Toggles:** You can now toggle the visibility of the Robot, Onion Skin, and Velocity Heatmap directly from the view options, providing more control over your canvas view.
- **Facing Point Heading:** A new `facingPoint` heading type has been added, allowing a path segment to continuously face a fixed coordinate. This includes an optional reverse flag and is fully supported in Java code export.
- **Universal Reverse Flag:** Added a reverse flag feature that handles reversing for constant, linear, and tangential headings seamlessly during path planning and code generation.

## **Bug Fixes:**

- **Continuous Playback:** Interacting with the UI (like panning or zooming the canvas) no longer unintentionally pauses the animation playback.
- **Auto-Reset Animation:** The animation controller now automatically resets to the beginning whenever you make changes to your path, ensuring your previews always start from the top.
- **File Manager Base Directory Constraint:** The File Manager now enforces the base directory constraint, preventing navigation above or outside the configured root directory.
- **Improved Accessibility:** Expanded screen reader support by adding missing `aria-labels` to icon-only buttons, including new labels for the Section Looping toggle and the palette menu.
