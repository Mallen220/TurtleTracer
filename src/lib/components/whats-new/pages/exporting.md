# Exporting Code

Turn your visualized paths into runnable robot code or shareable animations.

## Java OpMode (Standard)

Generates a complete, standalone OpMode for your autonomous routine. This is the recommended method for most teams.

*   **Full Class**: Creates a ready-to-run file including the `OpMode` structure, state machine, and path definitions.
*   **Snippets**: Uncheck "Generate Full Class" to get just the `PathChain` construction code for copy-pasting into your own classes.
*   **Hardcoded Paths**: The geometry is baked into the Java file. You do **not** need to upload the `.pp` file to the robot.
*   **Event Markers**: Automatically generates `addEventMarker` calls and placeholder comments for registering your commands.

## Command-Based (Advanced)

Generates a `SequentialCommandGroup` for use with command-based frameworks.

*   **Supported Libraries**:
    *   **SolversLib**: Standard integration.
    *   **NextFTC**: Experimental support.
*   **Dynamic Loading**: This mode uses `PedroPathReader` to load path data from the `.pp` file at runtime. **You must upload your `.pp` file to the robot** for this to work.
*   **Features**: Automatically handles `FollowPath`, `Wait`, and event triggers using `ParallelRaceGroup`.

## Other Formats

*   **Points List**: A raw array of coordinates (e.g., `[(10, 10), (20, 20)]`) for custom processing or debugging.
*   **Project File (.pp)**: Download the source file to share with teammates or back up your work.

## Animation Export

Create high-quality visualizers to share your strategy.

*   **Formats**:
    *   **GIF**: Best for compatibility (Discord, Slack).
    *   **APNG**: Higher quality with transparency support, but larger file sizes.
*   **Quality Controls**: Adjust **FPS**, **Scale**, and **Quality** to balance file size and visual fidelity.

## Dialog Tools

*   **Search (Ctrl+F)**: Quickly find specific lines or markers in the generated code.
*   **Package Name**: Set your team's package (e.g., `org.firstinspires.ftc.teamcode`) to fix imports automatically.
*   **Save to File**: Directly save `.java` or `.txt` files to your computer.
