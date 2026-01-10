# Event Markers

Event markers allow you to trigger actions at specific points along the path.

## Adding Markers

1.  **Select Path**: Click on a path segment to select it.
2.  **Add Marker**: In the "Event Markers" section, click "Add Marker".
3.  **Position**: Use the slider or input box to set the position of the marker along the path (0.0 to 1.0, representing 0% to 100%).

## Configuring Markers

- **Name**: Give the marker a descriptive name (e.g., "Open Claw", "Lift Slide"). This name will be used in the exported code to identify the event.
- **Color**: (Visual only) Markers appear as colored dots on the timeline and path.

## Use Cases

- **Subsystems**: Trigger intake, outtake, or mechanism movements at exact points.
- **Logic**: Update state variables or trigger conditional logic.
- ** Synchronization**: Coordinate robot actions with path progress.

## In Code

When you export your path, event markers are generated as callbacks or commands triggered when the robot reaches the specified path percentage.
