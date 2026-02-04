# Telemetry Import & Visualization

Validate your autonomous routines by comparing your planned path against real-world robot data. The Telemetry Import feature allows you to overlay recorded logs onto the field, helping you spot discrepancies, tune PID coefficients, and debug mechanical issues.

## Supported Formats

The visualizer supports both **CSV** and **JSON** file formats.

### CSV Format
Your CSV file should have a header row (optional but recommended) and columns for time, x, y, and heading.

```csv
time, x, y, heading
0.0, 10.0, 10.0, 0.0
0.1, 10.5, 10.2, 0.05
...
```

The importer tries to auto-detect columns, but generally expects:
- **Time**: Seconds or milliseconds
- **X / Y**: Field coordinates (inches)
- **Heading**: Robot heading in radians or degrees

### JSON Format
For JSON, provide an array of objects:

```json
[
  { "time": 0.0, "x": 10.0, "y": 10.0, "heading": 0.0, "velocity": 0.0 },
  { "time": 0.1, "x": 10.5, "y": 10.2, "heading": 0.05, "velocity": 5.0 }
]
```

## Using the Telemetry Overlay

1.  **Import Data**: Click the **Import Telemetry** button in the file manager toolbar (or press `Cmd+I` / `Ctrl+I`) and select your log file.
2.  **Visualization Options**:
    - **Show Telemetry Path**: Draws a line showing the robot's actual path on the field.
    - **Show Ghost Robot**: Displays a semi-transparent "ghost" robot that moves along the telemetry path during simulation playback.
3.  **Synchronization**:
    - **Time Offset**: If your log starts at a different time than your simulation, use the **Time Offset** slider to sync them up. This is crucial for comparing "planned vs. actual" side-by-side.

## Analyzing Results

- **Deviation**: Visually check how far the ghost robot deviates from the planned path.
- **Timing**: Use the timeline to see if the robot is ahead or behind schedule.
- **Velocity**: If your log includes velocity data, you can verify if the robot is reaching its target speeds.
