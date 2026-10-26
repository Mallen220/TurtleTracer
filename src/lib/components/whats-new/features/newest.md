### What's New!

## **Features:**

## Headings

- Leave a linear **Start** heading, or a constant heading, blank to use **Prev**. The path starts at whatever heading the robot has when it gets there, so you no longer retype the previous path's end angle. Hover the field to see the angle it stands for. This also works for piecewise segments, a chain's global heading and macros, where it follows whatever comes before the macro.
- If the first path starts at Prev, the starting point gets its own heading to set.
- Exported code writes the heading Prev stands for as a number. Importing that code gives you the numbers, not Prev.

## Motion settings

- Paste your whole Pedro `Constants.java` (or `.kt`) into **Settings → Motion** and Turtle Tracer fills in what it can read: forward and strafe velocity, max velocity, any acceleration and deceleration limits you set, path settle time, the handover brake coefficients, the Pedro version and your constants class. It leaves Translational P and Max Deceleration for the Telemetry tab to measure: the simulation's P is not your Pedro kP, and Pedro's coasting deceleration is much slower than how the robot brakes. It lists each change before you apply it. Works for Pedro 3 `ForesightConfig` files and the older Pedro 2 constants.
- A robot project that is open is read the same way, so the "Use the project's" button now offers those values, not just the brake coefficients.

## **Bug Fixes:**
