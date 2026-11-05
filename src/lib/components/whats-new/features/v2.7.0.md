### What's New in 2.7.0!

This release adds alliance selection and path mirroring, a Command Registrar setting for OpMode exports, and a few editing changes. If you use TurtleTracerLib, update it to 3.1.x or newer before you use Turtle Tracer 2.7.0.

## Alliance selection and path mirroring

> If you use TurtleTracerLib, update it to 3.1.x or newer before you use Turtle Tracer 2.7.0. This applies even if you never use alliance mirroring, because of a change to annotations. If you don't use TurtleTracerLib, you never have to install it. Alliance mirroring needs TurtleTracerLib 3.1.x or newer, and it is optional. If you already have a way of handling alliances that works for you, you can keep it.

- The Field tab has a new **Alliance Selection & Path Mirroring** section. Its settings are per project and are saved in the project's `.turt` file. The info icon on the heading links to the docs, since the feature needs TurtleTracerLib on the robot.
- **Drawn For** is the alliance the project's paths are drawn for, Red or Blue. New projects have none. Click the selected alliance again to clear it. With no alliance, exported code is the same as before and doesn't use TurtleTracerLib for alliances.
- **Mirror to Red** (or **Mirror to Blue**) sets what the exported code does. When it's on, the code runs as drawn on its own alliance and mirrored on the other, depending on which alliance the driver picks. When it's off, the code always runs as drawn, but it still records which alliance it is for so TeleOp can read it.
- **Preview on Blue** (or **Red**) shows the path and robot on the field as they will run for the other alliance. A banner says you're previewing. You can edit the path while previewing, and your edits change the project's own path.
- The export mirrors poses, curve control points, heading angles, facing-point targets, Rotate steps and pose event markers.
- The way the field mirrors depends on the season, so it's one setting for all projects: **Settings → Code Export → Field Mirror**. You can turn the field 180° (the default), flip it left to right, or flip it top to bottom.

## Auto selector and TeleOp

TurtleTracerLib 3.1.x also adds an optional auto selector. During init it can show a menu on the Driver Station. The driver picks an auto and an alliance with the gamepad, and the OpMode runs that auto when Start is pressed. Teams can use it to run all their autos from one OpMode.

- When **Mirror to Blue** (or **Red**) is on, exported Sequential Commands take the selector's context as their last argument. The code can't know which alliance the driver will pick until init, so it asks the context. Without mirroring, the constructor is unchanged. Add each auto to your selector with its alliance, such as `Alliance.RED`, and the menu shows whether it will mirror.
- Exported OpModes show their own alliance menu during init, so they don't need a selector of yours.
- The last alliance is kept until the Robot Controller app restarts, so TeleOp can read it with `AutoSelection.alliance()`.

The docs cover both in [Auto Selector & Mirroring](https://www.turtletracer.com/turtle-tracer-lib/auto-selector/) and [Mirroring for the Other Alliance](https://www.turtletracer.com/turtle-tracer/exporting/#mirroring-for-the-other-alliance).

## Code export

- Added an optional **Command Registrar** setting for OpMode exports, under **Settings → Code Export** and in the export dialog's **Options**. Enter a method of yours, such as `org.firstinspires.ftc.teamcode.RobotCommands.register`. The generated `init()` calls it with `hardwareMap` so your named commands exist before the first path runs. It is only written when the path has event markers.
- The export dialog shows the project's alliance setting above the code.

## Editing

- The shortcut that adds a path now puts it where your mouse is on the field, snapped to the grid if snapping is on. If the mouse isn't over the field, the path still goes near the middle.
- The shortcut that adds a control point does the same.
- The Field tab now shows **T**, how far along the current path the robot is, next to X, Y and heading.

## Other

- The release builds now use Node 24 and newer GitHub Actions.
