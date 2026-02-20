### What's New in 1.7.4!

## **Features:**

### **Playback UI Controls Overhaul**

- **Precision Playback**: Step through your path frame-by-frame for exact timing analysis.
- **Smart Snapping**: The playback slider now snaps to key events and durations for easier navigation.
- **Direct Time Editing**: You can now manually edit the current time in the playback bar.
- **Improved Layout**: A cleaner, more intuitive interface for controlling your path simulation.
- **Better Playback Controls**: Updated controls make scrubbing and playback smoother and more responsive.

### **Settings & Updates**

- **Manual Update Check**: Easily check for the latest version with a new button in the Settings menu.
- **New UI for Update Prompt**: Fresh design for the update notification dialog with clearer options.
- **MS Store Support**: App now detects installs from the Microsoft Store and handles updates accordingly.

### **Import/Export & Optimization**

- **Optimize Individual Paths**: Optimize dialog now lets users run a targeted optimization pass.
- **Import/Export Settings**: Load or save your configuration to a JSON file for easy migration between machines or backups.

### **Export Enhancements**

- **Show .pp File Content**: The Export dialog now previews the content of the generated `.pp` file for verification.
- **Export Image Option**: Capture a snapshot of the field or timeline directly from the export menu.
- **Critical Code Export Fixes**: Several bug fixes ensure generated Java code compiles and matches the selected path precisely.

### **Bug Fixes & Miscellaneous**

- **Start Position Data**: Corrected an issue where starting location was being written incorrectly in exports.
- **Plugins Icon**: Fixed the missing or broken icon in the Plugins menu.

### **Embed Pose Data in Code**

- **Single-File Solution**: You can now choose to embed pose data directly into the generated Java file.
- **No External Files**: Removes the dependency on loading `.pp` files at runtime. Helpful for debugging
- **Enable It**: Check the **Embed Pose Data in Code** option in the Export Code dialog.

## **Bug Fixes:**

### **Field Accuracy Update**

- **Refined Goal Positions**: The Red and Blue Goal obstacles for the DECODE 2025-2026 field have been updated with more accurate dimensions and placement.
