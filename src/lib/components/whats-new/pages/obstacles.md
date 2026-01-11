# Obstacles

Obstacles define restricted areas on the field. The path optimizer effectively routes around these zones to prevent collisions.

## Basics

*   **Add**: Click the **+** button in the Obstacles header.
*   **Name**: Type in the text box to rename (e.g., "Wall", "Stage").
*   **Color**: Click the color dot to change the obstacle's appearance.
*   **Delete**: Click the trash icon to remove the entire obstacle.

## Editing Shapes

Obstacles are polygons. You can modify their shape using the Sidebar or the Field.

### 1. On the Field (Interactive)
*   **Drag**: Click and drag any corner (vertex) to move it.
*   **Snap**: Dragging respects the **Snap to Grid** setting if enabled.

### 2. In the Sidebar (Precise)
*   **Coordinates**: Enter exact X and Y values for any vertex.
*   **Add Vertex**: Click **+** next to a coordinate row to insert a new corner after it.
*   **Remove Vertex**: Click the trash icon next to a coordinate row to delete it (minimum 3 corners).
*   **Collapse**: Click the arrow icon to hide the vertex list for a cleaner view.

## Safety & Collisions

*   **Safety Margin**: Set a buffer distance in **Settings**. The optimizer will keep the path this far away from all obstacles.
*   **Warnings**: The path prediction will visually indicate if the robot is projected to hit an obstacle.
