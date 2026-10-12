# What's New in 2.5.0!

This release connects Turtle Tracer to GitHub and to your editor, makes the app noticeably faster on lower-end laptops, and gives the interface a new look with better contrast and accessibility.

## GitHub and Java

- Import paths directly from GitHub, and commit changes back to the project from the browser or the desktop app.
- Watch a Java file while you edit it, similar to MeepMeep. When you save the file in your editor, the field updates.
- The File Manager now shows `.pp` and `.java` files.
- Generated Java classes are named after their project instead of a default name.
- Added experimental support for Ivy, and made it easier to add or edit command libraries in the future.

## Interface and accessibility

- The default accent color is now emerald, and the default path color is purple.
- Improved contrast and accessibility throughout the app.
- Rounded corners (`rounded-md`) are now the standard across the app.
- The Control Points section was redesigned to match the Paths tab. Control point drag and drop works, and its edits are recorded in the undo history.
- The stats panel now responds to mouse clicks. Click a graph, an insight, or a summary row to jump to that point on the timeline.
- Buttons such as "+ Add Control Point" are easier to notice.
- A new `lib/ui.ts` holds the shared styles for buttons, inputs, cards, and menus. This greatly cuts duplicated inline CSS and keeps the app consistent.

## Performance

- Major rendering improvements fix the poor frame rate on many lower-end laptops.
- Long paths are drawn more cleanly.

## Install and projects

- A new install script handles rate limiting better and supports more Windows devices.
- Fixed a bug when installing on some Linux distributions.
- The project folder prompt now appears on your first save, not when the app starts.

## Bug Fixes

- The velocity heatmap colored every path like the first one. Each path now uses its own speeds.
- Fixed speed spiking.
- The event marker box is no longer cut off.
