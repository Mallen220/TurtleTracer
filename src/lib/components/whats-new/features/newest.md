### What's New!

## **Features:**

- **Toggleable Coordinate System:** Switch between Pedro and FTC coordinate conventions with a new toggle, making it easier to work in your preferred reference frame.
- **Full Control over Path Deletion:** You can now delete the last remaining path segment using the delete button or keyboard shortcuts (Backspace/Delete), allowing for a completely empty workspace.
- **Cleaner Starting Point UI:** To keep the interface focused, "Initial Heading" controls in the Starting Point section are now hidden when path segments exist. They automatically reappear when the path is cleared.
- **Visual Heading Indicator:** Angle input fields on the Paths tab now include a small heading indicator that shows the current orientation at a glance.
- **Enhanced Ruler Readout:** The on-screen ruler now displays Delta X, Delta Y, and Angle for improved precision when measuring segments.
- **Performance Optimization:** The `analyzePathSegment` routine has been optimized with adaptive sampling for faster path calculations on complex curves.

## **Bug Fixes:**

- Major fixes applied to the Sequential NextFTC code exporter to ensure reliable, correct output.
- Auto-export now triggers correctly when project data changes (e.g. editing event markers) while enabled.
- Animation fixes: sequence events like "Rotate" now animate correctly even without a drawn path, and the robot is properly visualized in these scenarios.
- Fixed a crash that occurred when attempting to animate without any path lines.
