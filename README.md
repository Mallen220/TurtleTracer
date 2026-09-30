<div align="center">
  <img src="public/icon.png" alt="Turtle Tracer Logo" width="150" height="150">
  
  <h1>Turtle Tracer</h1>
  
  <p>
    <b>A native desktop path planner for FIRST Tech Challenge.</b>
  </p>
  
  <p>
    Visualize • Plan • Simulate • Export
  </p>

  <p>
    <a href="https://github.com/Mallen220/TurtleTracer/releases">
      <img src="https://img.shields.io/github/v/release/Mallen220/TurtleTracer?style=for-the-badge&color=007AFF" alt="Latest Release" height="28">
    </a>
    <a href="https://github.com/Mallen220/TurtleTracer/releases">
      <img src="https://img.shields.io/github/downloads/Mallen220/TurtleTracer/total?style=for-the-badge&color=4c1" alt="Total Downloads" height="28">
    </a>
    <a href="LICENSE">
      <img src="README_Content/Modified-License-Apache_2.0.svg" alt="License" height="28">
    </a>
    <img src="https://img.shields.io/badge/Platform-macOS%20|%20Windows%20|%20Linux-424242.svg?style=for-the-badge" alt="Platform" height="28">
  </p>

<p>
    <img src="https://sonarcloud.io/api/project_badges/measure?project=Mallen220_TurtleTracer&metric=alert_status"/>
    <img src="https://sonarcloud.io/api/project_badges/measure?project=Mallen220_TurtleTracer&metric=reliability_rating"/>
    <img src="https://sonarcloud.io/api/project_badges/measure?project=Mallen220_TurtleTracer&metric=security_rating"/>
    <img src="https://sonarcloud.io/api/project_badges/measure?project=Mallen220_TurtleTracer&metric=sqale_rating"/>
    <img src="https://sonarcloud.io/api/project_badges/measure?project=Mallen220_TurtleTracer&metric=vulnerabilities"/>
    <img src="https://sonarcloud.io/api/project_badges/measure?project=Mallen220_TurtleTracer&metric=bugs"/>
</p>
<p>

  
  <!-- COVERAGE_BADGE_START -->
  <a href="coverage/index.html">
    <img src="README_Content/coverage-badge.svg" alt="Branch Coverage: 85.8%" height="20">
  </a>
  <!-- COVERAGE_BADGE_END -->
</p>
  <!-- LIGHTHOUSE_BADGES_START -->
  <p>
    <a href="https://github.com/GoogleChrome/lighthouse">
      <img src="README_Content/lighthouse-badges/lighthouse_accessibility.svg" alt="Lighthouse Accessibility Badge">
    </a>
    <a href="https://github.com/GoogleChrome/lighthouse">
      <img src="README_Content/lighthouse-badges/lighthouse_best-practices.svg" alt="Lighthouse Best Practices Badge">
    </a>
    <a href="https://github.com/GoogleChrome/lighthouse">
      <img src="README_Content/lighthouse-badges/lighthouse_performance.svg" alt="Lighthouse Performance Badge">
    </a>
    <a href="https://github.com/GoogleChrome/lighthouse">
      <img src="README_Content/lighthouse-badges/lighthouse_seo.svg" alt="Lighthouse SEO Badge">
    </a>
  </p>
  <p><sub>Lighthouse badges generated for v2.3.0</sub></p>
  <!-- LIGHTHOUSE_BADGES_END -->

  <a href="https://apps.microsoft.com/detail/9nk0b4fdj3zw?referrer=appbadge&mode=full" target="_blank" rel="noopener noreferrer">
    <img src="https://get.microsoft.com/images/en-us%20dark.svg" width="180" alt="Get it from Microsoft">
  </a>
</div>

<br/>

> **Rapid development notice**
> This project is updated often. Check back for bug fixes and new features. If you find an error, report it on the [Issues tab](https://github.com/Mallen220/TurtleTracer/issues) and revert to a previous version.

---

<div align="center">
  <img src="README_Content/Hero.gif" alt="Hero GIF: Demo of Turtle Tracer in Action" />
</div>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Installation](#installation)
- [Workflow and file management](#workflow-and-file-management)
- [Exporting your paths](#exporting-your-paths)
- [Tech stack](#tech-stack)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License and acknowledgments](#license)

## Overview

Turtle Tracer is a desktop application built with Electron and Svelte for planning FIRST Tech Challenge autonomous routines.

Unlike web-based alternatives, it runs natively on your machine. That gives you offline use, local file management, and integration with your team's Git workflow.

## Features

Turtle Tracer is a desktop alternative to the web-based path planning tool.

### Performance and workflow

- Native desktop app: works offline and integrates with your OS.
- History: Auto-Save, full Undo/Redo, and a History Panel protect your progress.
- Git integration: see each file's status (Modified, Staged, Untracked) and version your paths alongside your robot code.

  <img src="README_Content/SomeFeatures.gif" alt="GIF of some great features!" />

### Analysis and simulation

- Telemetry overlay: import real robot log data to compare how your path performed on the field with the plan.
- Physics-based simulation: real-time kinematics with velocity constraints and acceleration profiles.
- Heatmaps and stats: color-coded velocity gradients along the path, velocity graphs, and timing breakdowns.

### Planning tools

- File macros: drag and drop `.turt` or legacy `.pp` files to reuse a path sequence as a sub-routine (macro).
- Smart validators: real-time feedback on obstacles and keep-in zones, plus continuous path safety validation.
- Path optimizer: one-click optimization that refines paths for speed while respecting field boundaries.

  <img src="README_Content/CommandPallete.png" alt="Screenshot showing the Command Palette (Cmd+K)" />

### Interface

- Command palette: press `Cmd+K` (or `Ctrl+K`) to search for paths, settings, or commands.
- Custom field maps: import any field image with the built-in Calibration Wizard.
- Robot profile manager: manage multiple robot configurations, each with its own dimensions and constraints.

## Installation

### macOS

**One-Line Installer (Recommended):**

```bash
curl -fsSL https://raw.githubusercontent.com/Mallen220/TurtleTracer/main/install.sh | bash
```

_(Enter your password when prompted to complete installation)_

<details>
<summary><b>Manual Installation</b></summary>
1. Download the latest `.dmg` from <a href="https://github.com/Mallen220/TurtleTracer/releases">Releases</a>.<br>
2. Mount the DMG and drag the app to your Applications folder.<br>
3. <b>Important:</b> Run the following command in Terminal to clear the quarantine attribute:<br>
   <code>sudo xattr -rd com.apple.quarantine "/Applications/Turtle Tracer.app"</code>
</details>

### Windows

**Microsoft Store (Recommended):** Download from the [Microsoft Store](https://apps.microsoft.com/detail/9nk0b4fdj3zw?referrer=appbadge&mode=full) to get automatic updates for stable releases.

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

## Workflow and file management

Unlike web-based tools, Turtle Tracer manages your files locally.

- Paths are saved as `.turt` files on your hard drive, not in a browser cache.
- You can commit `.turt` files to Git alongside your robot's Java code.
- The native file browser lets you organize folders, duplicate routines, and manage backups without leaving the app.

## Exporting your paths

  <img src="README_Content/LiveCodePreview.gif" alt="GIF of the Live Code Preview panel" />

Turtle Tracer can export:

1. Java class: a complete, ready-to-run Java file for your FTC robot controller (`TurtleTracerLib` compliant).
2. Sequential commands: code formatted for command-based frameworks.
3. Strategy sheet: a printable summary of your routine for planning with alliance partners.
4. Visual media: APNG, GIF, and static images of your paths for engineering notebooks.

## Tech stack

Turtle Tracer uses web technologies packaged for the desktop:

<p>
  <img src="https://img.shields.io/badge/Electron-191924?style=for-the-badge&logo=electron&logoColor=white" alt="Electron">
  <img src="https://img.shields.io/badge/Svelte-FF3E00?style=for-the-badge&logo=svelte&logoColor=white" alt="Svelte">
  <img src="https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Node.js-43853D?style=for-the-badge&logo=node.js&logoColor=white" alt="Node">
</p>

## Troubleshooting

- **macOS "App is damaged" error:** macOS requires you to un-quarantine manually installed apps. Run: `sudo xattr -rd com.apple.quarantine "/Applications/Turtle Tracer.app"`
- **Windows SmartScreen warning:** Click "More Info" and then "Run Anyway". The code is fully open source.
- **Linux AppImage won't run:** Make sure `libfuse2` is installed and the file has execution permissions (`chmod +x`).

## Contributing

Contributions are welcome. To start developing locally:

```bash
# Clone the repository
git clone [https://github.com/Mallen220/TurtleTracer.git](https://github.com/Mallen220/TurtleTracer.git)
cd TurtleTracer

# Install dependencies and start the dev server
npm install
npm run dev

# (Optional) Build for your current platform
npm run dist
```

See the [Contribution Guidelines](CONTRIBUTING.md) for more details.

> AI assistance policy: AI tools are used to prototype and speed up development, but no code is merged without human review and testing.

## License

This project is open source and released under a [Modified Apache 2.0 License](LICENSE).

Turtle Tracer runs locally and does not collect personal data. See the full [Privacy Policy](PRIVACY.md).

## Acknowledgments

- #16166 Watt's Up, for the initial concept, development, and inspiration.
- The Pedro Pathing developers, for the library this visualizer supports.
- The FIRST community, for feedback and testing.

<br>

<div align="center">
  <sub>Built by <a href="https://github.com/Mallen220">Matthew Allen</a> & Contributors</sub>
  <br>
  <sub>Not officially affiliated with FIRST® or Pedro Pathing.</sub>
</div>
