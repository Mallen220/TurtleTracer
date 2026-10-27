### What's New in 2.6.1!

This release simulates Pedro Pathing's headings and path handovers more closely. You can leave a heading blank to continue from the previous path, paste your Pedro constants file to fill in settings, and edit event markers in the Paths tab. It also fixes several bugs.

## **Features:**

## Headings

- Leave a linear **Start** heading, or a constant heading, blank to use **Prev**. The path starts at whatever heading the robot has when it gets there, so you no longer retype the previous path's end angle. Hover the field to see the angle it stands for. This also works for piecewise segments, a chain's global heading and macros, where it follows whatever comes before the macro.
- If the first path starts at Prev, the starting point gets its own heading to set.
- Exported code writes the heading Prev stands for as a number. Importing that code gives you the numbers, not Prev.
- The reverse checkbox's tooltip now describes what it does. On a linear heading it turns the long way round (Pedro's `longLinear`). On a tangential heading it makes the robot face backwards (Pedro's `.reverse()`).
- Splitting a path with a long-way-round linear heading keeps both halves turning the long way.
- Java and Kotlin import read `reversedLinear` and `setReversed()` the way Pedro runs them.
- `.pp` files now read reverse the way the Pedro Visualizer does.

## Event markers

- Each path, wait and rotate step in the **Paths** tab now has its own event marker list. Add and edit a step's markers right under it, including the first marker from the step's drawer.
- A step's markers stay within that step. Their positions and times can't drift outside the path, wait or rotate they belong to.
- Collapse all and expand all now cover the event markers too.

## Motion settings

- Paste your whole Pedro `Constants.java` (or `.kt`) into **Settings → Motion** and Turtle Tracer fills in what it can read: forward and strafe velocity, max velocity, any acceleration and deceleration limits you set, path settle time, the handover brake coefficients and your constants class. It leaves Translational P and Max Deceleration for the Telemetry tab to measure: the simulation's P differs from your Pedro kP, and Pedro's coasting deceleration is much slower than how the robot brakes. It lists each change before you apply it. Works for Pedro 3 `ForesightConfig` files and the older Pedro 2 constants.
- A robot project that is open is read the same way, so the "Use the project's" button now offers those values, not just the brake coefficients.
- The default robot settings are more realistic for most teams. Forward and strafe velocity are now 45 and 35 in/s (strafing is slower), max velocity is 50 in/s, max acceleration is 60 in/s² and max deceleration is 70 in/s² (robots brake harder than they speed up). Turning is 100°/s, and path settle time is 0.1 s, which is Pedro's default timeout.
- Without brake coefficients, the simulation now estimates how far the robot slides before a chained path hands over from Max Deceleration, so a softer robot takes longer to stop.
- The hints for Max Deceleration, Path Settle Time and Translational P now describe what each setting does in the simulation and how it differs from the matching Pedro value.

## Simulation accuracy

- The simulation now follows Pedro 3. **Settings → Motion → Pedro Pathing Version** is gone. Several leftover Pedro 2 heading behaviors were fixed along the way.
- Heading progress along a path is measured by distance travelled, the way Pedro 3 measures it, so piecewise heading segments change over where the path actually is.
- When a path starts facing the wrong way, the robot turns on the spot until it is close to the heading the path wants, then sets off still turning. With stop-to-turn on, it finishes the whole turn first. A chained path is picked up on the move instead.
- Pedro counts a path as done 97.5% of the way along it and then holds the end until the robot settles or the timeout runs out. The simulation does the same, so the next step can start while the robot is still moving, and the robot carries that speed and direction into it.
- A robot that runs wide near the end of a path no longer counts as arrived until it is actually back on the end point.
- The robot's animation now lags a little behind its commands.

## **Bug Fixes:**

- The path optimizer no longer over-penalizes. Moving a path costs far less, so it can straighten bends that aren't needed. A new cost for turning more than the original stops it from adding loops and S-bends.
- Corner warnings no longer suggest changing Translational P, which the robot's code can't change. They offer speed limits instead.
- Possibly fixed paths leaking internal state, which could invalidate a session.
- Dragging the divider between the field and the sidebar now follows the pointer from wherever you grab it.
- Fixed the window and app icons on Linux, including in the taskbar and window switcher. The installer now installs a 1024px icon and uninstalling removes the old icon locations too.
- Loading a robot profile now asks you to click twice to confirm. The old confirmation dialog broke text input on some operating systems and left the settings stale.
- Security updates.
