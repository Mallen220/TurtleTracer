======================================================================
                     TURTLE TRACER - macOS README
======================================================================

RECOMMENDED INSTALLATION (AUTOMATIC)
----------------------------------------------------------------------
The easiest and recommended way to install Turtle Tracer on macOS is via
our one-line installer. Open Terminal and run:

  curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash

This script automatically verifies SHA-256 checksums, installs the app
into /Applications, and clears macOS Gatekeeper quarantine flags automatically.


MANUAL INSTALLATION & DE-QUARANTINE INSTRUCTIONS
----------------------------------------------------------------------
1. Drag "Turtle Tracer.app" into the "Applications" folder shortcut.

2. macOS Gatekeeper Quarantine:
   Because Turtle Tracer is an open-source build without an Apple Developer
   certificate, macOS Gatekeeper may flag manually downloaded files and show
   a warning like:
   "Turtle Tracer is damaged and can't be opened. You should move it to the Trash."
   or "Developer cannot be verified."

3. How to De-Quarantine and Run:
   If macOS prevents the app from running, clear the quarantine attribute:
   
   a. Open Terminal (Command + Space, type "Terminal").
   b. Run this command:

      sudo xattr -rd com.apple.quarantine "/Applications/Turtle Tracer.app"

   c. Enter your Mac password when prompted.

4. Launch Turtle Tracer from Applications!

======================================================================
Repository & Documentation: https://github.com/Mallen220/TurtleTracer
