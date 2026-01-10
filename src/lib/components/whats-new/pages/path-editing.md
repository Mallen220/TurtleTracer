# Path Editing

Creating and editing paths is the core functionality of the Visualizer. Here's how to master the path editing tools.

## Creating a Path

1.  **Add Points**: Click the "Add Point" button (or use a shortcut) to add a new waypoint to your path.
2.  **Duplicate Path**: Use `Shift + D` to quickly duplicate the currently selected path.
3.  **Move Points**: Drag any point on the canvas to change its position.
4.  **Path Type**: The path connects points using Bezier curves. You can adjust the curvature using control points.

## Tools & Actions

- **Reverse Path**: Select a path and choose "Reverse Path" to create a new path that follows the reverse trajectory.
- **Context Menu**: Right-click on the waypoint table to access additional options like deleting, duplicating, or locking paths.

## Control Points

Each path segment has control points that define the curve.

- **Tangent**: The control points determine the tangent of the curve at the start and end points.
- **Adjusting**: Drag the blue control point handles to shape the curve.
- **Adding/Removing**: You can add more control points for complex curves in the "Control Points" section of the path settings.

## Heading Modes

The robot's heading (orientation) can be controlled independently of the path direction.

- **Tangential**: The robot faces the direction of travel. You can reverse this to make the robot drive backwards.
- **Constant**: The robot maintains a fixed heading throughout the path segment.
- **Linear**: The robot's heading changes linearly from a start angle to an end angle over the course of the segment.

## Path Chains

You can link multiple path segments together to create a continuous routine.

- **Linked Points**: If you name two paths with the same name (e.g., "Path 1"), their start/end points will be linked. Moving one will move the other.
- **Wait Times**: You can add wait times between paths to simulate pauses or robot actions.

## Precision Tools

- **Grid Snapping**: Enable grid snapping in the settings to align points to a grid (1" - 24").
- **Coordinates**: You can manually enter X/Y coordinates for precise positioning in the path settings panel.
