<div align="center">
  <img src="public/icon.png" alt="Pedro Pathing Visualizer Logo" width="120" height="120">
  <h1 align="center">Pedro Pathing Visualizer</h1>
  <p align="center">
    <strong>The modern, intuitive path planner for FIRST Robotics Competition.</strong>
  </p>
  <p align="center">
    Visualize • Plan • Simulate • Export
  </p>

  <p align="center">
    <a href="https://github.com/Mallen220/PedroPathingVisualizer/releases">
      <img src="https://img.shields.io/github/v/release/Mallen220/PedroPathingVisualizer?style=flat-square&color=blue" alt="Latest Release">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/license-Apache%202.0-green.svg?style=flat-square" alt="License">
    </a>
    <img src="https://img.shields.io/badge/platform-macOS%20|%20Windows%20|%20Linux-lightgrey.svg?style=flat-square" alt="Platform">
  </p>
</div>

> ## This project is currently undergoing rapid updates. Please check back regularly for bug fixes and new features. If you find an error, please report it and revert to a previous version.

---

## 🚀 Overview

**Pedro Pathing Visualizer** is a powerful desktop application built with Electron and Svelte, designed to revolutionize how FIRST Robotics Competition teams plan their autonomous routines. Unlike web-based alternatives, this tool runs natively on your machine, offering superior performance, local file management, and deep integration with your development workflow.

## ✨ Features

Experience a comprehensive suite of tools designed for precision and efficiency:

- **🎨 Visual Path Editing**: Intuitive drag-and-drop interface for creating complex Bezier curves, straight lines, and path chains.
- **🤖 Advanced Simulation**: Real-time robot physics simulation featuring accurate kinematics, velocity constraints, and acceleration profiles.
- **⚠️ Obstacle & Collision Detection**: Define custom field obstacles (polygons) and get immediate feedback on potential collisions during path planning.
- **🔄 Sequence Editor**: Build full autonomous routines by sequencing paths, adding wait times, and triggering event markers.
- **💾 Local File Management**: Robust system for saving, loading, and organizing `.pp` project files directly on your file system.
- **📤 Powerful Export Options**:
  - **Java Code**: Generate full OpModes for the Pedro Pathing library.
  - **APNG & GIF Export**: Share your path animations with the team using high-quality exported visualizer recordings.
  - **JSON Export**: Raw data export for custom parsers.
- **⚡ Productivity Tools**:
  - **Onion Skinning**: Visualize previous path states for precise adjustments.
  - **Undo/Redo**: Full history support for mistake-free editing.
  - **Multi-Window Support**: Open multiple project windows simultaneously.
- **📏 Precision Tools**: Integrated Ruler, Protractor, and customizable Grid snapping (1" - 24") for exact field positioning.
- **🛠️ Customization**: Full support for custom field maps, robot sizing, color themes, and adjustable safe margins.
- **📦 Cross-Platform**: Native, optimized applications for macOS, Windows, and Linux.
- **♾️ And so, so much more!** Check back often for updates and new features.

## 📥 Installation

### **macOS**

**One-Line Installer (Recommended):**
Open Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash
```

_Enter your password when prompted to complete installation._

**Manual Installation:**

1.  Download the latest `.dmg` from [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases).
2.  Mount the DMG and drag the app to your Applications folder.
3.  **Important**: Run the following command in Terminal to clear the quarantine attribute (prevents "App is damaged" errors):
    ```bash
    sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app"
    ```
4.  Launch the application.

### **Windows**

1.  Download the latest `.exe` from [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases).
2.  Run the installer.
3.  _Note: If SmartScreen appears, click "More info" > "Run anyway"._

### **Linux**

**One-Line Installer (Recommended):**
Open Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash
```

_Enter your password when prompted to complete installation._

**Manual Installation:**

1.  Download the `.deb` (Debian/Ubuntu) or `.AppImage` from [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases).
2.  Fix permissions for Sandboxing by installing and adding "--no-sandboxing" to the .desktop icons.
3.  Install using your package manager of choice `libfuse2` and `zlib1g` as well as any sub-dependencies.
4.  **Important**: Other various errors are likely to occur including depending on your Distro of choice. Testing is varied by Ubuntu is most closely watched. If you would like to become a tester please reach out.
5.  Launch the application.

**AppImage:**

```bash
chmod +x Pedro*.AppImage
./Pedro*.AppImage
```

## 🗂️ File Management

One of the critical advantages of Pedro Pathing Visualizer over web-based tools is its **Local File Management system**.

- **Security & Persistence**: Your paths are saved as actual files (`.pp`) on your hard drive, not in a temporary browser cache that can be accidentally cleared.
- **Version Control**: You can easily commit your path files to Git alongside your robot code, ensuring your team always has the latest versions.
- **Organization**: Use the built-in file browser to organize paths into folders, duplicate successful routines, and manage backups without leaving the app.

## 🛠️ Tool Overview

### **Canvas Tools**

- **Grid & Snap**: Toggle customizable grids (1" - 24") and enable snapping for perfect alignment.
- **Ruler**: Measure distances instantly between any two points on the field.
- **Protractor**: Measure relative angles, with options to lock to the robot's heading.

### **Path Editing**

- **Control Points**: Fine-tune Bezier curves by manipulating control handles.
- **Heading Modes**: Choose between Tangential, Constant, or Linear heading interpolation for precise robot orientation.
- **Event Markers**: Place named triggers along the path to fire actions (e.g., "Open Claw") at exact path percentages.

### **Animation Controller**

- **Timeline**: Scrub through your autonomous routine to verify timing and sequence order.
- **Real-time Feedback**: See exact robot coordinates and heading at any point in time.

## 📤 Export Options

The visualizer provides flexible export capabilities to suit your team's workflow:

1.  **Java Class**: Generates a complete, ready-to-run Java file for your FTC robot controller.
2.  **Sequential Commands**: Exports code formatted for command-based frameworks, integrating paths with your subsystems.
3.  **JSON / Text**: Raw data export for custom parsers or debugging.

## 🔧 Troubleshooting

### **macOS**

- **"App is damaged" / Can't Open**:
  Run the quarantine fix command:
  ```bash
  sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Visualizer.app"
  ```
- **Gatekeeper**: If the app is blocked, go to _System Settings > Privacy & Security_ and click "Open Anyway".

### **Windows**

- **SmartScreen Warning**: This is common for new software. Click "More Info" and "Run Anyway".
- **Antivirus**: If the file is flagged, adds an exception. The code is open source and safe.

### **Linux**

- **AppImage not running**: Ensure you have `libfuse2` installed and have given the file execution permissions (`chmod +x`).

## 🧩 Development

Want to contribute or build from source?

### **Prerequisites**

- Node.js 18+
- Git

### **Setup**

```bash
# Clone the repository
git clone https://github.com/Mallen220/PedroPathingVisualizer.git
cd PedroPathingVisualizer

# Install dependencies
npm install

# Start development server
npm run dev
```

### **Building**

```bash
# Build for your current platform
npm run dist
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1.  Fork the repository.
2.  Create your feature branch (`git checkout -b feature/AmazingFeature`).
3.  Commit your changes (`git commit -m 'Add some AmazingFeature'`).
4.  Push to the branch (`git push origin feature/AmazingFeature`).
5.  Open a Pull Request.

## 📄 License

This project is open for everyone! We believe in the power of open source and community collaboration. You are free to use, modify, and distribute this software as you see fit. All we ask is that you give credit to the original developers and any contributors who have helped shape this tool. If you make improvements, please consider sharing them back with the community!

See the [LICENSE](LICENSE) file for the full Apache 2.0 legal text.

## 🙏 Acknowledgments

- **#16166 Watt's Up**: For the initial concept, development, and inspiration.
- **Pedro Pathing Developers**: For the underlying library this visualizer supports.
- **FIRST Community**: For the continuous feedback and testing.
- **Contributors**: All the developers who have helped improve this tool.

## 🔗 Links

- [GitHub Repository](https://github.com/Mallen220/PedroPathingVisualizer)
- [Releases](https://github.com/Mallen220/PedroPathingVisualizer/releases)
- [Issues & Bug Reports](https://github.com/Mallen220/PedroPathingVisualizer/issues)

---

<div align="center">
  <sub>Built by <a href="https://github.com/Mallen220">Matthew Allen</a> & Contributors</sub>
  <br>
  <sub>Not officially affiliated with FIRST® or Pedro Pathing.</sub>
</div>
