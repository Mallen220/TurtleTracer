# Getting Started

Welcome to **Pedro Pathing Visualizer**, the modern path planner for FRC/FTC. This guide will get you up and running in minutes.

## 1. The Interface

*   **Canvas (Center)**: Your field view. Drag to pan, scroll to zoom.
*   **Inspector (Right)**: Edit properties of selected points or paths.
*   **Timeline (Bottom)**: Scrub through your autonomous routine.
*   **Toolbar (Left)**: Access files, settings, and different editing modes.

## 2. Your First Path

1.  **Start**: The robot starts at the green point. Drag it to your starting position.
2.  **Add a Point**: Press **`P`** or click the **+** button to create a new waypoint.
3.  **Shape the Path**:
    *   Drag the **white point** to move the destination.
    *   Drag the **blue handles** to curve the path (Bezier).
4.  **Chain It**: Press **`P`** again to add another segment connected to the last one.

## 3. Power Features

Don't stop at simple lines! The visualizer allows for advanced control:

*   **⚡ Path Optimization**: Automatically refine your path for maximum speed and safety. Click the *Chart* icon to try it. [Learn more](/optimization)
*   **📍 Linked Events**: Trigger robot actions (like "Open Claw") at exact points along the path. [Learn more](/event-markers)

## 4. Visualize & Export

*   **Simulate**: Press **`Space`** to watch your robot drive the path.
*   **Verify**: Check for collisions or awkward movements.
*   **Export**: Click the **Code** icon (top right) to generate Java code for your robot.

## ⚡ Essential Shortcuts

| Action | Shortcut |
| :--- | :--- |
| **Add Path** | `P` |
| **Add Wait** | `W` |
| **Play / Pause** | `Space` |
| **Undo** | `Ctrl + Z` |
| **Save** | `Ctrl + S` |
