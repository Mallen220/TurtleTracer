# Settings

Configure the visualizer and robot parameters.

> **⚠️ Important:** These settings affect the **visualizer only**. Ensure your robot's code constants match these values for accurate simulation.

## Keyboard Shortcuts

View and customize key bindings for faster editing.

- Click **Open Editor** in the settings menu to manage shortcuts.

## Robot Configuration

Set physical dimensions for collision detection.

- **Dimensions**: Set **Length** and **Width** (in inches).
- **Safety Margin**: Buffer zone around obstacles (in inches).
- **Validation**:
  - **Field Boundaries**: Warn if the robot leaves the field or goes close then the safety margin to the field wall.
  - **Restrict Dragging**: Prevent moving points outside the field.
- **Robot Image**: Upload a custom top-down image or use the default.

## Motion Parameters

Simulate robot physics for path timing.

- **Velocity**: Set **Max Velocity** (in/s) and **Angular Velocity** (π rad/s).
- **Acceleration**: Set **Max Acceleration** and **Deceleration** (in/s²).
- **Friction**: Adjust surface resistance coefficient.

## Interface Settings

Customize the visualizer appearance.

- **Theme**: Light, Dark, or System Auto.
- **Field Map**: Select the current season's field image.
- **Orientation**: Rotate the field view (0°–270°).
- **Velocity Heatmap**: Color-code the path based on speed (Green = Slow, Red = Fast).

## Advanced Settings

### Visualization

- **Onion Layers**: Show robot outlines at regular intervals along the path.
- **Spacing**: Adjust distance between layers.

### Path Optimization

Tune the genetic algorithm for automatic path refinement:

- **Iterations**: Number of improvement cycles.
- **Population**: Paths tested per cycle.
- **Mutation Rate**: Frequency of point changes.
- **Mutation Strength**: Max distance points move.

## Credits & Legal

- View version, contributors, and licenses.
- **Reset All**: Restore default settings.
