# Getting Started

Welcome to Matthew Allen's **Pedro Pathing Plus Visualizer**, the modern path planner for FTC. This guide will get you up and running in minutes.

## 1. The Interface

- **Field Map / Canvas (Left)**: Your field view. Drag to pan, scroll to zoom.
- **Control Tab / Inspector (Right)**: Edit properties of selected points or paths.
- **Timeline (Bottom)**: Scrub through your autonomous routine.
- **NavBar (Top)**: Access files, settings, and different editing modes.

## 2. Your First Path

1.  **Start**: The robot starts at a preset point. Drag it to your starting position.
2.  **Add a Point**: Press **`P`** or click the green **+** button to create a new waypoint.
3.  **Shape the Path**:
    - Drag the **end point** to move the destination.
    - Add **Control Points** and drag them to curve the path (Bezier).
4.  **Chain It**: Press **`P`** again to add another segment connected to the last one.

## 3. Power Features

Don't stop at simple lines! The visualizer allows for advanced control:

- **⚡ Path Optimization**: Automatically refine your path for maximum speed and safety. Click the _Table_ icon to try it. [Learn more](optimization.md)
- **📍 Event Markers**: Trigger robot actions (like "Open Claw") at exact points along the path. [Learn more](event-markers.md)

## 4. Visualize & Export

- **Simulate**: Press **`Space`** to watch your robot drive the path.
- **Verify**: Check for collisions or awkward movements.
- **Export**: Click the **Export** button (top right) to generate Java code for your robot.

## ⚡ Essential Shortcuts

| Action           | Shortcut   |
| :--------------- | :--------- |
| **Add Path**     | `P`        |
| **Add Wait**     | `W`        |
| **Play / Pause** | `Space`    |
| **Undo**         | `Ctrl + Z` |
| **Save**         | `Ctrl + S` |
