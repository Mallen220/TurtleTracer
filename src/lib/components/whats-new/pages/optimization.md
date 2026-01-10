# Path Optimization

The Path Optimizer uses a genetic algorithm to automatically refine your paths for speed and safety.

## How it Works

The optimizer iteratively tweaks control points to:

1.  **Minimize Time**: Reduce the total travel time based on your robot's motion constraints.
2.  **Avoid Collisions**: Ensure the path (and the robot's body) stays clear of defined obstacles and field boundaries.

## Running Optimization

1.  **Open Dialog**: Click the "Optimize" button.
2.  **Settings**: Adjust iterations, population size, etc., if needed (in Settings).
3.  **Start**: Click "Start Optimization".
4.  **Review**: Watch the progress log and preview the optimized path (dashed line).
5.  **Apply**: If satisfied, click "Apply New Path".

## Tips for Success

- **Initial Path**: Create a rough path that is close to valid. The optimizer works best when it has a decent starting point.
- **Constraints**: Define accurate robot dimensions and motion limits in Settings.
- **Obstacles**: Ensure all field obstacles are correctly defined.
- **Locking**: You can "lock" specific paths or points if you don't want the optimizer to change them.

## Parameters

- **Iterations**: How many generations to run. More iterations = better results but takes longer.
- **Population**: Number of candidate paths per generation.
- **Mutation Rate**: How drastically the path can change in each step.
