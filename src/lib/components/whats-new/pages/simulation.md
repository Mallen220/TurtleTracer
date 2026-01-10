# Simulation & Playback

The simulation feature allows you to visualize how your robot will follow the planned path, including physics and kinematics.

## Playback Controls

- **Play/Pause**: Click the play button or press `Space` to start/stop the simulation.
- **Scrubbing**: Drag the slider to scrub through the timeline.
- **Speed**: Adjust the playback speed (0.25x - 3.0x) using the speed dropdown.
- **Loop**: Toggle looping to repeat the animation automatically.

## Robot Physics

The simulation takes into account:

- **Velocity**: The robot's speed is constrained by the max velocity setting.
- **Acceleration**: Acceleration and deceleration limits are applied.
- **Kinematics**: The robot's movement follows the specified path and heading modes.

## Real-time Feedback

- **Position**: The current X/Y coordinates and heading of the robot are displayed.
- **Heatmap**: Enable the velocity heatmap in settings to see the robot's speed visualized along the path (Green = fast, Red = slow).
- **Ghost Paths**: (Optional) Visualize the robot's footprint along the path to check for clearances.

## Verification

Use the simulation to verify:

- **Timing**: Check the total duration of your autonomous routine.
- **Collisions**: Visually check if the robot comes too close to obstacles or field boundaries.
- **Smoothness**: Ensure the path and heading changes are smooth and achievable by the robot.
