# What's New in 2.4.0!

This release makes path editing, project files, collision detection, macros, exports, and keyboard shortcuts more reliable and more consistent with each other. It also includes a big cleanup of the code behind them.

## New setting

- Square Corners: turn this on in Settings under Interface to draw buttons, dialogs, panels, and inputs with square corners instead of rounded ones. It is off by default and applies as soon as you check it.

## Simulation and collisions

- Collision markers now line up with the robot's actual position. Angled robots are checked with the correct orientation, and thin obstacles crossing the robot are detected. Before, the red collision stretch of a path could be drawn several inches away from the real collision point.
- Distance on curved paths is now measured along the curve instead of as straight segments, and travel time estimates include acceleration.
- Large heading changes no longer rotate the long way around, so some paths are noticeably faster.
- Before its first path, the robot now faces the way that path starts. The first path is the first one the robot actually drives, including paths inside macros. An empty project no longer shows the robot at 0 degrees, and exported code starts from the same heading as the preview.

## Macros

- Facing-point and piecewise paths are tracked correctly, which removes unnecessary alignment turns. Transformed macros now move their heading targets with them.
- A project can no longer include itself as a macro and loop forever, and the check is faster.

## Files and projects

- "Save To," "New File," and Java imports keep all required project data, and "Save To" no longer marks the open project as saved.
- Files opened through the system file picker are tracked correctly, including on Windows, where they could be written to the root of the drive. Renaming a file that is only selected no longer changes which project is open.
- The project-data preview in the export dialog shows exactly what saving will write, including unsaved changes. It used to show the last version on disk.
- Updating a moved macro no longer rewrites other macro files with absolute paths, which broke moving or sharing a project folder.
- Robot profiles, plugin settings, and command palette history are kept between launches.
- Projects created by older versions no longer override the robot image you selected.
- Unreadable files are no longer read again and again.

## Editing and shortcuts

- Reverse path, snap selection, and moving items up or down had stopped working. They work again.
- Adding a path, wait, or turn with the keyboard now matches the menu. The new item goes after your selection, and new paths start in a sensible position and direction.
- Duplicate now works for turns in the Table tab, and it is disabled for macros instead of silently doing nothing.
- Clearing a start or end angle resets it to `0`, invalid values are no longer saved as `NaN`, and negative durations are rejected.
- Focusing a facing-point heading now moves straight to Target X.
- Dropping a marker onto an automatic turn on the timeline no longer deletes the turn.
- Pressing Escape in the playback time box now cancels your edit instead of committing it, and F2 "Rename" works on a path in the Paths tab.

## Import and export

- Java imports now read raw radians and common heading expressions such as `pose.getHeading()` and `turnTo(Math.toRadians(...))` correctly.
- SVG export includes the built-in robot when no robot image is set.
- GIF export no longer makes an extra PNG copy of every frame, so it does less work.

## Performance

- Export tools load only when you use them, so the app loads about a quarter less script. The field panel no longer animates into place on startup, and the default field image is preloaded. Our desktop Lighthouse performance score went from about 78 to 96 in testing.
- Update information is fetched when you open Settings instead of on every launch, and timing is no longer recalculated several times for each edit.

## Security and platform

- External pages now open in your default browser instead of an app window with file-system access, and the app window is sandboxed.
- Plugin context-menu icons no longer break the field's right-click menu.
- Several crashes in the browser build, when desktop-only features are not available, are fixed. This mostly affects developers.

## For plugin and integration developers

- The `onSave` hook now runs for every save, however the user saves a project. It used to run only for saves from the file manager.
- Duplicated code for path creation, field markers, exports, settings, heading controls, and desktop API access was merged, and loose `any` types were replaced with real ones. `plugins/turtle.d.ts` was regenerated to match.
- Access to the desktop API is now centralized, with extra checks for desktop-only functions, so the desktop app and the browser build behave more alike.

## Under the hood

This is one of the larger cleanups in recent development. Thousands of lines of duplicated or unused code were removed, and big components such as the file manager, settings, path table, and main app were simplified. The automated test suite now has 2,176 tests, and branch coverage is above 85%.
