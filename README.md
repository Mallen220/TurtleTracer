<div align="center">
  <img src="public/icon.png" alt="Pedro Pathing Plus Visualizer Logo" width="120" height="120">
  <h1 align="center">Pedro Pathing Plus Visualizer</h1>
  <p align="center">
    <strong>The modern, intuitive path planner for FIRST Robotics Competition.</strong>
  </p>
  <p align="center">
    Visualize • Plan • Simulate • Export
  </p>

  <p align="center">
    <a href="https://github.com/Mallen220/PedroPathingPlusVisualizer/releases">
      <img src="https://img.shields.io/github/v/release/Mallen220/PedroPathingPlusVisualizer?style=flat-square&color=blue" alt="Latest Release">
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

**Pedro Pathing Plus Visualizer** is a powerful desktop application built with Electron and Svelte, designed to revolutionize how FIRST Robotics Competition teams plan their autonomous routines. Unlike web-based alternatives, this tool runs natively on your machine, offering superior performance, local file management, and deep integration with your development workflow.

## 🌟 Unmatched Features

Pedro Pathing Plus Visualizer isn't just a port of the web tool—it's a complete reimagining of what path planning should be. Here's why you should make the switch:

### 🚀 **Next-Level Performance & Workflow**

- **Native Desktop Experience**: Built with Electron for blazing fast performance. Works offline, supports multiple windows, and integrates with your OS.
- **Local File System**: Open and save `.pp` files directly on your computer. No more uploading/downloading or losing work to browser cache clears.
- **Git Integration**: See your file status (Modified, Staged, Untracked) instantly. Version control your paths alongside your robot code.
- **Auto-Save & History**: Never lose progress with robust Auto-Save and full Undo/Redo support.

### 📊 **Professional Analysis & Simulation**

- **Telemetry Overlay**: Import real robot log data to see exactly how your path performed on the field compared to the plan.
- **Advanced Statistics**: View Velocity Graphs, Acceleration profiles, and Timing breakdowns.
- **Heatmaps**: Visualize robot velocity along the path with color-coded gradients to spot bottlenecks.
- **Physics-Based Simulation**: Real-time kinematics simulation with accurate velocity constraints and acceleration profiles.

### 🛠️ **Powerful Planning Tools**

- **File Macros**: Reuse successful path sequences! Drag and drop other `.pp` files to use them as sub-routines (macros) with support for transformations (mirror/reverse).
- **Smart Validators**:
  - **Collision Detection**: Real-time feedback on Obstacles and Keep-In Zones.
  - **Continuous Validation**: Option to check your path's safety in real-time as you edit.
  - **Diff View**: Visually compare your current changes against the saved version.
  - **Onion Skinning**: See previous path states to make precise adjustments.
- **Path Optimizer**: Single-click optimization to refine your paths for maximum speed while respecting field boundaries and obstacles.
- **Custom Field Maps**: Import any field image with the built-in Calibration Wizard.

### ⚡ **Efficiency Boosters**

- **Interactive Onboarding**: New to the app? The built-in interactive tutorial will guide you through your first path.
- **Robot Profile Manager**: Manage multiple robot configurations with unique dimensions and constraints, and switch between them instantly.
- **Command Palette**: Press `Cmd+K` (or `Ctrl+K`) to instantly search for paths, settings, or commands.
- **Plugin System**: Extend functionality with community plugins or build your own to add custom tabs and tools.
- **Presentation Mode**: One-click cleaner interface for demonstrating paths to judges or teammates.
- **Export Power**:
  - **Java Code**: Generates `PedroPathingPlus` compliant code.
  - **Visuals**: Export high-quality **APNG** and **GIF** animations of your paths.

### ✨ **Stunning UI & UX Overhaul**

We've polished every pixel to make path planning a joy.

- **Modern Clean Interface**: A complete visual refresh with standardized color-coding (Green for Paths, Amber for Waits, Pink for Rotates) makes complex routines easy to read at a glance.
- **Responsive Design**: Whether you're on a laptop or a massive monitor, the UI scales perfectly. Mobile-friendly resizing means it even works on smaller screens if you need to check a path on the go.
- **Intuitive Dialogs**: Redesigned settings and file managers that are easier to navigate and nicer to look at.

### ⚙️ **Under-the-Hood Engineering**

It's not just about looks—the engine is brand new.

- **Performance**: Major backend refactoring and optimized field rendering logic mean the app runs smoother, even with complex paths and heavy telemetry data.
- **Readability**: The codebase has been cleaned up and modernized, making it easier for contributors to add features (and for the app to run without hiccups).
- **Stability**: Automated testing and continuous validation ensure that the app is reliable when you need it most—at the competition.

### 🎨 **Fully Customizable**

- **Theming**: Light Mode, Dark Mode, and custom theme plugins.
- **Keybindings**: Every action is remappable. Custom profiles supported.
- **Font Sizing**: Adjustable font sizes to suit your preference and screen resolution.

Oh, and so so many little improvements not even included yet! Check back often for a growing list of upgrades!

## 📥 Installation

### **macOS**

**One-Line Installer (Recommended):**
Open Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingPlusVisualizer/main/install.sh | bash
```

_Enter your password when prompted to complete installation._

**Manual Installation:**

1.  Download the latest `.dmg` from [Releases](https://github.com/Mallen220/PedroPathingPlusVisualizer/releases).
2.  Mount the DMG and drag the app to your Applications folder.
3.  **Important**: Run the following command in Terminal to clear the quarantine attribute (prevents "App is damaged" errors):
    ```bash
    sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Plus Visualizer.app"
    ```
4.  Launch the application.

### **Windows**

1.  Download the latest `.exe` from [Releases](https://github.com/Mallen220/PedroPathingPlusVisualizer/releases).
2.  Run the installer.
3.  _Note: If SmartScreen appears, click "More info" > "Run anyway"._

> Windows tile assets are generated from `public/icon.png` and copied into `build/` during `npm run build`. This guarantees the Appx (.appx/.appxupload) produced by `electron-builder` contains product-specific tile images (no OS default tiles). Use `npm run generate:icons` and `npm run check:tiles` to regenerate and validate the tile images.

### **Linux**

**One-Line Installer (Recommended):**
Open Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingPlusVisualizer/main/install.sh | bash
```

_Enter your password when prompted to complete installation._

**Manual Installation:**

1.  Download the `.deb` (Debian/Ubuntu) or `.AppImage` from [Releases](https://github.com/Mallen220/PedroPathingPlusVisualizer/releases).
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

One of the critical advantages of Pedro Pathing Plus Visualizer over web-based tools is its **Local File Management system**.

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
  sudo xattr -rd com.apple.quarantine "/Applications/Pedro Pathing Plus Visualizer.app"
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
git clone https://github.com/Mallen220/PedroPathingPlusVisualizer.git
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

## 🔒 Privacy

Your privacy is important to us. The Pedro Pathing Plus Visualizer is designed to run locally on your machine and does not collect personal data.

For more details, please review our full [Privacy Policy](PRIVACY.md).

## 🙏 Acknowledgments

- **#16166 Watt's Up**: For the initial concept, development, and inspiration.
- **Pedro Pathing Developers**: For the underlying library this visualizer supports.
- **FIRST Community**: For the continuous feedback and testing.
- **Contributors**: All the developers who have helped improve this tool.

## 🔗 Links

- [GitHub Repository](https://github.com/Mallen220/PedroPathingPlusVisualizer)
- [Releases](https://github.com/Mallen220/PedroPathingPlusVisualizer/releases)
- [Issues & Bug Reports](https://github.com/Mallen220/PedroPathingPlusVisualizer/issues)

---

<div align="center">
  <sub>Built by <a href="https://github.com/Mallen220">Matthew Allen</a> & Contributors</sub>
  <br>
  <sub>Not officially affiliated with FIRST® or Pedro Pathing.</sub>
</div>
