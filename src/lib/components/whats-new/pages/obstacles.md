# Obstacles

Defining obstacles helps you avoid collisions during path planning.

## Adding Obstacles

1.  **Create**: Click the "+" button in the Obstacles section to add a new obstacle.
2.  **Shape**: Obstacles are defined as polygons. You can add or remove vertices to create complex shapes.
3.  **Position**: Drag the vertices on the canvas to define the obstacle's boundary.

## Managing Obstacles

- **Naming**: Give your obstacles descriptive names (e.g., "Stage", "Wall").
- **Color**: Assign colors to obstacles for better visibility.
- **Visibility**: You can toggle the visibility of individual obstacles or the entire section.

## Collision Detection

- **Visual Warning**: If the robot's path intersects with an obstacle, it may not be explicitly flagged in real-time, but you can visually verify it during simulation.
- **Optimization**: The path optimizer considers obstacles and will try to find a path that avoids them.

## Safety Margin

You can define a "Safety Margin" in the settings. This adds a buffer zone around obstacles and field boundaries that the path optimizer will try to respect, ensuring the robot doesn't get too close.
