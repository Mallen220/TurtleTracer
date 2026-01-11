# Path Optimization

The **Path Optimizer** uses a genetic algorithm to automatically refine your autonomous paths. It evolves your path over multiple generations to find the fastest route while strictly avoiding collisions.

## Core Concepts

The optimizer treats your path like a living organism that evolves. It tries thousands of variations to balance two competing goals:

1.  **Speed**: Minimizing travel time based on your robot's constraints (velocity, acceleration).
2.  **Safety**: Avoiding all defined obstacles and field boundaries.

## Before You Start

For the optimizer to work effectively, ensure your **Settings** are accurate:

- **Robot Dimensions**: Set the correct `Length` and `Width` of your robot.
- **Safety Margin**: Add a buffer (e.g., 2 inches) to ensure you don't graze obstacles. The more precise the drive train the smaller the buffer.
- **Obstacles**: Define accurate obstacles in the "Obstacles" tab.

## The Optimization Process

When you run the optimizer, it follows these steps:

1.  **Initialization**: It starts with your current path and creates 50+ variations (the "population").
2.  **Evaluation**: It simulates every path to calculate travel time and check for collisions.
3.  **Selection**: It keeps the fastest, safest paths. Colliding paths are heavily penalized.
4.  **Mutation**: It slightly modifies the survivors—moving control points or adding/removing them—to explore new solutions.
5.  **Repeat**: This cycle repeats for the defined number of iterations.

> **Note**: The optimizer will automatically add or remove control points if it helps navigate around an obstacle.

## Understanding the Settings

You can tune the optimizer in the **Settings** menu. Here is what each knob does:

### 1. Optimization Iterations

- **What it is**: The number of generations the algorithm runs.
- **Effect**: Higher values give the optimizer more "time to think."
- **Recommendation**: Start with **100**. Increase to **300+** for complex obstacle courses.

### 2. Population Size

- **What it is**: The number of path variations tested in each generation.
- **Effect**: Larger populations explore more options but run slower.
- **Recommendation**: **50** is usually sufficient.

### 3. Mutation Rate

- **What it is**: The probability that a control point will be moved in a generation.
- **Effect**:
  - **Low (0.1)**: Fine-tuning. Good for polishing a nearly perfect path.
  - **High (0.5)**: Exploration. Good for finding completely new routes.
- **Recommendation**: Default is **0.4**.

### 4. Mutation Strength

- **What it is**: The maximum distance (in inches) a point can move during a single mutation.
- **Effect**:
  - **Low (1.0)**: Small nudges.
  - **High (10.0)**: Large jumps.
- **Recommendation**: Default is **6.0**. The optimizer automatically increases this if the path is currently colliding.

## Pro Tips

- **Locking**: If you have a segment you _know_ is perfect (e.g., scoring alignment), select the line and check **Lock Line**. The optimizer will not touch it.
- **Good Start**: Give the optimizer a rough path that is somewhat close to valid. It works faster if it doesn't have to untangle a complete mess.
- **Visual Feedback**: The dashed line shows the best path found so far. If it stops improving, you can click **Stop Optimization** early.
