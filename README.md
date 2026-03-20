<div align="center">
  <img src="public/icon.png" alt="Turtle Tracer Logo" width="150" height="150">
  
  <h1>Turtle Tracer</h1>
  <p><em>(Previously Pedro Pathing Plus Visualizer)</em></p>
  
  <p>
    <b>The modern, intuitive, and native path planner for FIRST Tech Challenge.</b>
  </p>
  
  <p>
    Visualize • Plan • Simulate • Export
  </p>

  <p>
    <a href="https://github.com/Mallen220/TurtleTracer/releases">
      <img src="https://img.shields.io/github/v/release/Mallen220/TurtleTracer?style=for-the-badge&color=007AFF" alt="Latest Release">
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/badge/License-Apache_2.0-00C853.svg?style=for-the-badge" alt="License">
    </a>
    <img src="https://img.shields.io/badge/Platform-macOS%20|%20Windows%20|%20Linux-424242.svg?style=for-the-badge" alt="Platform">
  </p>

  <a href="https://apps.microsoft.com/detail/9nk0b4fdj3zw?referrer=appbadge&mode=full" target="_blank" rel="noopener noreferrer">
    <img src="https://get.microsoft.com/images/en-us%20dark.svg" width="180" alt="Get it from Microsoft">
  </a>
</div>

<br/>

> **⚠️ Rapid Development Notice**
> This project is currently undergoing rapid updates. Please check back regularly for bug fixes and new features. If you find an error, please report it via the [Issues tab](https://github.com/Mallen220/TurtleTracer/issues) and revert to a previous version.

---

<div align="center">
  <img src="README_Content/Hero.gif" alt="Hero GIF: Demo of Turtle Tracer in Action" />
</div>

---

## Table of Contents

- [Overview](#overview)
- [Unmatched Features](#unmatched-features)
- [Installation](#installation)
- [Workflow & File Management](#workflow--file-management)
- [Exporting Your Paths](#exporting-your-paths)
- [Tech Stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License & Acknowledgments](#license)

---

## Overview

**Turtle Tracer** is a powerful desktop application built with Electron and Svelte, designed to revolutionize how FIRST Tech Challenge teams plan their autonomous routines. 

Unlike web-based alternatives, Turtle Tracer runs **natively on your machine**. This means superior performance, actual local file management, offline capabilities, and deep integration with your team's Git workflow. 

---

## Unmatched Features

Turtle Tracer isn't just a port of the web tool—it's a complete reimagining of what path planning should be. 

### Next-Level Performance & Workflow
* **Native Desktop Experience:** Blazing fast performance that works offline and integrates smoothly with your OS.
* **Robust History:** Never lose progress with Auto-Save, full Undo/Redo support, and a dedicated History Panel.
* **Git Integration:** See file status (Modified, Staged, Untracked) instantly. Version control your paths alongside your robot code.

  <img src="README_Content/SomeFeatures.gif" alt="GIF of some great features!" />


### Professional Analysis & Simulation
* **Telemetry Overlay:** Import real robot log data to see exactly how your path performed on the field compared to the plan.
* **Physics-Based Simulation:** Real-time kinematics simulation with accurate velocity constraints and acceleration profiles.
* **Heatmaps & Stats:** Visualize robot velocity along the path with color-coded gradients, Velocity Graphs, and Timing breakdowns.

### Powerful Planning Tools
* **File Macros:** Reuse successful path sequences! Drag and drop `.turt` or legacy `.pp` files to use them as sub-routines (macros).
* **Smart Validators:** Get real-time feedback on Obstacles, Keep-In Zones, and continuous path safety validation. 
* **Path Optimizer:** Single-click optimization to refine paths for maximum speed while respecting field boundaries.

  <img src="README_Content/CommandPallete.png" alt="Screenshot showing the Command Palette (Cmd+K)" />


### UI & Efficiency Boosters
* **Command Palette:** Press `Cmd+K` (or `Ctrl+K`) to instantly search for paths, settings, or commands.
* **Custom Field Maps:** Import any field image with the built-in Calibration Wizard.
* **Robot Profile Manager:** Manage multiple robot configurations with unique dimensions and constraints.

---

## Installation

### macOS
**One-Line Installer (Recommended):**
```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash
```
*(Enter your password when prompted to complete installation)*

<details>
<summary><b>Manual Installation</b></summary>
1. Download the latest `.dmg` from <a href="https://github.com/Mallen220/TurtleTracer/releases">Releases</a>.<br>
2. Mount the DMG and drag the app to your Applications folder.<br>
3. <b>Important:</b> Run the following command in Terminal to clear the quarantine attribute:<br>
   <code>sudo xattr -rd com.apple.quarantine "/Applications/Turtle Tracer.app"</code>
</details>

### Windows
**Microsoft Store (Recommended):** Download from the [Microsoft Store](https://apps.microsoft.com/detail/9nk0b4fdj3zw?referrer=appbadge&mode=full) to receive seamless auto-updates for stable releases.

<details>
<summary><b>Manual Installation (.exe)</b></summary>
1. Download the latest `.exe` from <a href="https://github.com/Mallen220/TurtleTracer/releases">Releases</a>.<br>
2. Run the installer.<br>
3. <i>Note: If SmartScreen appears, click "More info" > "Run anyway".</i>
</details>

### Linux
**One-Line Installer (Recommended):**
```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash
```

<details>
<summary><b>AppImage / Manual Installation</b></summary>
1. Download the `.deb` or `.AppImage` from <a href="https://github.com/Mallen220/TurtleTracer/releases">Releases</a>.<br>
2. For AppImage, grant execution permissions:<br>
   <code>chmod +x TurtleTracer*.AppImage</code><br>
   <code>./TurtleTracer*.AppImage</code><br>
3. Ensure you have <code>libfuse2</code> and <code>zlib1g</code> installed via your package manager.
</details>

---

## Workflow & File Management

One of the critical advantages of Turtle Tracer over web-based tools is its **Local File Management system**.

* **Security & Persistence:** Paths are saved as actual `.turt` files on your hard drive—not in a fragile browser cache.
* **Version Control Friendly:** Easily commit `.turt` files to Git alongside your robot's Java code.
* **Built-in Organizer:** Use the native file browser to organize folders, duplicate routines, and manage backups without leaving the app.

---

## Exporting Your Paths

  <img src="README_Content/LiveCodePreview.gif" alt="GIF of the Live Code Preview panel" />


The visualizer provides flexible export capabilities for any team's workflow:

1. **Java Class:** Generates a complete, ready-to-run Java file for your FTC robot controller (`TurtleTracerLib` compliant).
2. **Sequential Commands:** Exports code formatted for command-based frameworks.
3. **Strategy Sheet:** Export a printable summary of your routine for strategizing with alliance partners.
4. **Visual Media:** Export high-quality **APNG**, **GIF**, and **Static Images** of your paths for engineering notebooks.

---

## Tech Stack

Turtle Tracer is built with modern web technologies packaged for the desktop:

<p>
  <img src="https://img.shields.io/badge/Electron-191924?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white" alt="Svelte">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node">
</p>

---

## Troubleshooting

* **macOS "App is damaged" error:** macOS requires you to un-quarantine manually installed apps. Run: `sudo xattr -rd com.apple.quarantine "/Applications/Turtle Tracer.app"`
* **Windows SmartScreen warning:** Click "More Info" and then "Run Anyway". The code is fully open-source and safe.
* **Linux AppImage won't run:** Ensure `libfuse2` is installed and the file has execution permissions (`chmod +x`).

---

## Contributing

Contributions are heavily encouraged! To get started developing locally:

```bash
# Clone the repository
git clone [https://github.com/Mallen220/TurtleTracer.git](https://github.com/Mallen220/TurtleTracer.git)
cd TurtleTracer

# Install dependencies and start the dev server
npm install
npm run dev

# Build for your current platform
npm run dist
```

See our [Contribution Guidelines](CONTRIBUTING.md) (if applicable) for more details. 

> **AI Assistance Policy:** We use AI tools to prototype and speed up development. However, **no code is merged without human review and testing**. We believe AI should augment human effort, not replace it.

---

## License

This project is open-source and released under a [Modified Apache 2.0 License](LICENSE). 

Your privacy is important to us. Turtle Tracer runs locally and does not collect personal data. Review our full [Privacy Policy](PRIVACY.md).

## 🙏 Acknowledgments

* **#16166 Watt's Up**: For the initial concept, development, and inspiration.
* **Pedro Pathing Developers**: For the underlying library this visualizer supports.
* **The FIRST Community**: For continuous feedback, testing, and making this tool better for everyone.

<br>

<div align="center">
  <sub>Built by <a href="https://github.com/Mallen220">Matthew Allen</a> & Contributors</sub>
  <br>
  <sub>Not officially affiliated with FIRST® or Pedro Pathing.</sub>
</div>