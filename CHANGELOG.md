## 1.7.3 (2026-02-10)

- Add Sticky Notes plugin, disabled by default. Add Telemetry documentation page. Redesign Plugin Manager UI for better usability and descriptions. More keybinds and fixed conflicts. Users can drag Timeline Event Markers. Remove Discord for now. Add header info to saved .pp files. Prevent dragging on action names. Add heading normalization for Rotate and Path commands. Fix file renaming in FileManager. Fix correctly handling initial rotation in path time calculation. Update LICENSE and Privacy Policy. Add confirmation for obstacle deletion. Add Split Path keybind (K). Add MSIX windows 11 autopackager.

## 1.7.2 (2026-02-04)

- Quick Fix: Rename to pedro-pathing-plus-visualizer across project. Add live code preview tab when auto export is enabled (recommended). Changed default port from 34567 to 17218. Several critical security fixes. Added keybind hints. Add Follow Robot toggle to settings and field renderer. Configurable Telemetry Export within exported code. Telemetry support for Panels, Standard FTC, FtcDashboard + Standard, future support for PPP visualizer. Add keybindings for copying code/table and downloading java when in certain tabs. Add smart object snapping for field waypoints, can be disabled in settings interface.

## 1.7.1 (2026-01-29)

- Improve download count fetch robustness. Refactor action types to use a dynamic registry system for increased plugin support. Add Auto Export Code feature, disabled by default in settings. Implement History Panel and enhance undo/redo visibility. Preparation for stable release. Added Strategy Sheet export option. Rename to Pedro Pathing Plus Visualizer to better distinguish between the original program.

## 1.7.0 (2026-01-23)

- Added new Discord server link to Navbar! Join new and be one of the first members! Added Presentation Mode (Option/Alt + P). Added Plugin Manager. Add Git Status checker and diff view (Can be disabled in settings). Add Custom Field Map Import Wizard. Always more key binds, now supporting Copy, Cut, Paste. Add Keep-In Zones (opposite of Obstacles) and shape visibility controls. Add interactive onboarding tutorial to help new users. Command Palette now searches for paths, events, and waits in current file. Validation checks now works in ranges instead of points. Added continuous validation checker (disabled in settings by default). Add path analysis graphs to statistics dialog. Add Telemetry Data Import & Visualization (Will be expanded in future versions). Added file macros allowing users to pass auto sequences into other files (Drag and drop from file manager). Macros support path transformations and basic recursion. Added setting to change font size. Overhauled settings UI for cleaner interface.

## 1.6.2 (2026-01-15)

- Fixed faulty Linux support. Add setting to show onion skins only on current path. Add drag-and-drop support for .pp files. Fix linked points rotation logic. Implement initial directory setup dialog. Added Autosave functionality. Remove ghost path feature entirely; it will not be implemented in future versions. Disable Chromium keyboard shortcuts for a safer experience. Always more keybinds. Improve new project reset logic. Replace event text input with searchable dropdown. Added PedroPathingPlus documentation. Improve Robot Profile Manager UX. Angular Velocity settings correctly affect path time. Add Angular Acceleration setting and Deg/s unit toggle. Better Close/Save Checking and UI dialog.

## 1.6.1 (2026-01-13)

- Overhauled the paths tab to match other sections and be much cleaner and more intuitive. Better support on smaller screens. Improved command palette with file access and setting commands. More keybind shortcuts. Added Robot Profile Manager feature, allowing users to have multiple robots saved. Add confirm step to delete buttons. Add GitHub Actions release workflow for all platforms to try to fix broken Linux support.

## 1.6.0 (2026-01-12)

- Add Path Statistics dialog and integration. Add support for 'Rotate' sequence items that use PedroPathings turnto() method, including keybind, event marker, and sequential command support. Add Velocity Heatmap visualization in settings. Refactored event markers into global event markers for a better user experience and updated the obstacles UI to match, both are now in the control tab’s field tab. Reverse quality slider direction in ExportGifDialog. Add support for opening external links in default browser instead of Electron. Fix animation export cancellation support. Remove frame cap for GIF/APNG export and improve timing. Always new keybinds. Add "What's New" dialog for first launch and docs (Shift + N to open). Updated with support for PedroPathingPlus v1.0.6. Unify UI colors for event types: Path (Green), Wait (Amber), Rotate (Pink). Dramatically improve timeline visualizer with event markers, wait highlights, and rotate markers.

## 1.5.1 (2026-01-08)

- Fixed critical error on Windows systems. Added context to the waypoint menu.

## 1.5.0 (2026-01-07)

- Increase optimization mutation strength. Overhaul Navbar UI. Dramatically imporved backend testing. Optimized field rendering logic. Overhaul keybinds UI. Credits and Legal section added in settings. Add Animated PNG (APNG) export support. add duplicate keybind and functionality (shift+d). Add zoom controls, panning, and keyboard shortcuts to Field View. Improve export dialog. Resolve numerous TypeScript and Svelte check errors. Added context menu (right click dropdown) to waypoint table for added controls. Changed save icon. Unified wait and path UI to be the same. open file manager on save for untitled projects. add reverse path tool. add field boundary validation and drag restrictions, configurable in settings. Added sticky header to waypoint table. Add name-based linking for waypoints and wait events with java exporter support. Add safety validation for zero-length paths. Added lots of tooltips.

## 1.4.3 (2026-01-03)

- Fix critical error breaking several versions due to stale or undefined settings. implement realistic motion profiling for path segments and fix unexpected behavior. Better testing. Add path validation and collision visualization. reorder control points via drag-and-drop and buttons. Overhaul File Manager UI for better scalability and better user experience. Add credits section to settings dialog.

## 1.4.2 (2025-12-31)

- Fast Fix Settings not loading properly leading to critical application failures.

## 1.4.1 (2025-12-30)

- Optimized optimization and field logic that caused laggy behavior. allow opening multiple app windows easily. export .pp file. Decouple settings from project files. Better code testing. implement.pp file association.

## 1.3.5 (2025-12-30)

- Better new line/wait ordering. Lined up trash cans in table view. Added wait lock toggle in table. Added visual indication for selected path in field view. Add color picker to table. Initialize paths to empty name. Added drag and drop support to paths tab. Updated settings icon for light mode support. Fix for safety margin in optimization code. Standardize delete buttons to use trash can icon. improve path time calculation fixing angular momentum calculation. Better setting reset capabilities. Added App Loading Animation on boot. Added copy markdown table option to table view. Fix robot dimensions naming discrepancy. Preserve onion layer visibility on undo/redo. Fixed visualizer on heading changes. Update protractor icon from ↻ to ➜ for clarify. Prettied the json in the .pp files. Revamp GIF export with preview and quality settings. Fix for Issue 50: Add generated-code warning header. Security fixes. Added configurable Java package name. Double clicking resizer defaults to 50% scale. Code exporter dropdown auto closes.

## 1.3.4 (2025-12-28)

- Fixing intel mac support.

## 1.3.3 (2025-12-28)

- Sidebar toggle. Greatly enhanced keybind features. Playback speed controller. Major backend reformatting.

## 1.3.2 (2025-12-28)

- add ARIA labels. Add number of downloads. Fix mirror of tangential points. Add application help on mac's header. Add resize option for Control tag and many dynamic reformatting changes. Path Optimization avoids obstacles and various enhancements. Table includes delete option. Overhaul Export Dialog UI. Security enhancements.

## 1.3.1 (2025-12-26)

- Added field rotate feature. Add field cordinate mouse display. Add recent view in File manager. Added waypoint tab for a different path making experience. Added selected path for optimized keybind shortcuts. Collapse/expand all option.

## 1.3.0 (2025-12-26)

- Added keyboard shortcuts menu and updater. Added support for NextFTC (still being tested). Better layout of control tab. Uses PedroPathingPlus gradle library.

## 1.2.9 (2025-12-25)

- Add event markers for wait steps with SolversLib support.
- Added customizable Keyboard Shortcuts in the Settings menu.

## 1.2.8 (2025-12-23)

- Added timeline markers. Added path optimizer based on PathPlanner algorithm. Optimization settings exist in the settings section.

## 1.2.7 (2025-12-21)

- Skip version feature now works. Added ability to create paths after the starting point. Added sequence reordering. Double-click to create paths. Bug Fixes.

## 1.2.6 (2025-12-21)

- Fixed file importer and wait header.

## 1.2.5 (2025-12-21)

- Allows unlimited instances of the app to be running, add GIF exporting, testing x86_64 (amd64) support.

## 1.2.4 (2025-12-21)

- Added onion skinning and undo/redo

## 1.2.3 (2025-12-19)

- Added snap to grid feature, improved drag behavior, major backend refractoring for much better readability, Added wait commands and made the file manager more robust.

## 1.2.2 (2025-12-08)

- Moved theme selection to settings. Enhanced file manager fixing some users directories. Add file renaming support to FileManager. Quickfix: Improve heading initialization. Updated Icon.

## 1.2.1 (2025-12-06)

- Quick Fix: Hard Block all Image/Field Dragging for a better interface.

## 1.2.0 (2025-12-05)

- Added Events! (Experimental)

## 1.1.9 (2025-12-05)

- Rehauled the settings menu. Selectable field option. See app verison in settings. Better navbar protractor placement.

## 1.1.8 (2025-12-04)

- Added persistent settings memory. Backend cleanup. "FPA Settings" renamed to just "settings". Security improvements.

## 1.1.7 (2025-12-03)

- Added lock function to paths and start point. Improved header labels. Better FPA settings. Better time calculations and no header jumping during autos.

## 1.1.6 (2025-12-03)

- Attempting to add new executables

## 1.1.5 (2025-12-01)

- Added Icon and better install steps. Warning if attempting an unsafe manual install.

## 1.1.4 (2025-12-01)

- Fixed release logs

## 1.1.3 (2025-12-01)

- Minor Fixes

## 1.1.2 (2025-12-01)

- Tag testing

## 1.1.1 (2025-12-01)

- Added dmg and auto release system
