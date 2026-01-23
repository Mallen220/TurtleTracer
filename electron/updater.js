// Copyright 2026 Matthew Allen. Licensed under the Apache License, Version 2.0.
import { dialog, app, shell } from "electron";
import * as fs from "fs";
import * as path from "path";
import { spawn, spawnSync } from "child_process";

class AppUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentVersion = app.getVersion();
    this.updaterSettingsPath = path.join(
      app.getPath("userData"),
      "updater-settings.json",
    );
  }

  async checkForUpdates() {
    try {
      console.log("Checking for updates...");

      // GitHub API URL for your repository releases
      const repoUrl =
        "https://api.github.com/repos/Mallen220/PedroPathingVisualizer/releases/latest";

      const response = await fetch(repoUrl);

      if (!response.ok) {
        throw new Error(`GitHub API responded with status: ${response.status}`);
      }

      const releaseData = await response.json();
      const latestVersion = releaseData.tag_name.replace("v", "");

      console.log(`Current: ${this.currentVersion}, Latest: ${latestVersion}`);

      // Check if this version was skipped
      const skippedVersions = this.loadSkippedVersions();
      if (skippedVersions.includes(latestVersion)) {
        console.log(`Version ${latestVersion} was previously skipped.`);
        return;
      }

      if (this.isNewerVersion(latestVersion, this.currentVersion)) {
        this.showUpdateAvailableDialog(releaseData);
      } else {
        console.log("Application is up to date.");
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      // Don't show error to user on startup to avoid annoyance
    }
  }

  isNewerVersion(latest, current) {
    const latestParts = latest.split(".").map(Number);
    const currentParts = current.split(".").map(Number);

    for (
      let i = 0;
      i < Math.max(latestParts.length, currentParts.length);
      i++
    ) {
      const latestPart = latestParts[i] || 0;
      const currentPart = currentParts[i] || 0;

      if (latestPart > currentPart) return true;
      if (latestPart < currentPart) return false;
    }

    return false;
  }

  loadSkippedVersions() {
    try {
      if (fs.existsSync(this.updaterSettingsPath)) {
        const data = fs.readFileSync(this.updaterSettingsPath, "utf8");
        const settings = JSON.parse(data);
        return settings.skippedVersions || [];
      }
    } catch (error) {
      console.error("Error loading updater settings:", error);
    }
    return [];
  }

  saveSkippedVersions(skippedVersions) {
    try {
      const settings = {
        skippedVersions: skippedVersions,
        lastUpdated: new Date().toISOString(),
      };
      fs.writeFileSync(
        this.updaterSettingsPath,
        JSON.stringify(settings, null, 2),
      );
    } catch (error) {
      console.error("Error saving updater settings:", error);
    }
  }

  async showUpdateAvailableDialog(releaseData) {
    // Wait a bit for the main window to be fully ready
    setTimeout(() => {
      const result = dialog.showMessageBoxSync(this.mainWindow, {
        type: "info",
        title: "Update Available",
        message: `A new version of Pedro Pathing Visualizer is available!`,
        detail: `Current version: ${this.currentVersion}\nLatest version: ${releaseData.tag_name}\n\n\nWould you like to download the update?`,
        buttons: [
          "Download and Install",
          "Open Releases Page",
          "Skip This Version",
          "Remind Me Later",
        ],
        defaultId: 0,
        cancelId: 3,
      });

      const version = releaseData.tag_name.replace("v", "");

      switch (result) {
        case 0: // Download and Install
          this.handleDownloadAndInstall(version, releaseData.html_url);
          break;
        case 1: // Open Releases Page
          shell.openExternal(releaseData.html_url);
          break;
        case 2: // Skip This Version
          const skippedVersions = this.loadSkippedVersions();
          const versionToSkip = version;
          if (!skippedVersions.includes(versionToSkip)) {
            skippedVersions.push(versionToSkip);
            this.saveSkippedVersions(skippedVersions);
            console.log(`User skipped version ${versionToSkip}`);
          }
          break;
        case 3: // Remind Me Later
          // Do nothing, will check again on next startup
          break;
      }
    }, 3000);
  }

  handleDownloadAndInstall(version, releasesUrl) {
    try {
      if (process.platform === "win32") {
        const downloadUrl = `https://github.com/Mallen220/PedroPathingVisualizer/releases/download/v${version}/Pedro-Pathing-Visualizer-Setup-${version}.exe`;
        shell.openExternal(downloadUrl);
      } else if (process.platform === "darwin") {
        const command =
          "curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash";
        const appleScript = `tell application "Terminal" to do script "${command}"`;
        spawn("osascript", ["-e", appleScript]);
        spawn("osascript", ["-e", 'tell application "Terminal" to activate']);
      } else if (process.platform === "linux") {
        const command =
          "curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingVisualizer/main/install.sh | bash";
        if (!this.openTerminalLinux(command)) {
          // Fallback
          shell.openExternal(releasesUrl);
        }
      } else {
        // Unknown OS
        shell.openExternal(releasesUrl);
      }
    } catch (err) {
      console.error("Error launching installer:", err);
      shell.openExternal(releasesUrl);
    }
  }

  openTerminalLinux(command) {
    // Try to find a terminal emulator and run the command
    // We try them in order of preference
    const terminals = [
      {
        cmd: "gnome-terminal",
        args: ["--", "bash", "-c", command],
      },
      {
        cmd: "x-terminal-emulator",
        args: ["-e", "bash", "-c", command],
      },
      {
        cmd: "konsole",
        args: ["-e", "bash", "-c", command],
      },
      {
        cmd: "xterm",
        args: ["-e", "bash", "-c", command],
      },
    ];

    for (const term of terminals) {
      if (this.trySpawnLinux(term.cmd, term.args)) {
        return true;
      }
    }
    return false;
  }

  trySpawnLinux(terminal, args) {
    try {
      // Check if the terminal executable exists
      if (spawnSync("which", [terminal]).status === 0) {
        spawn(terminal, args, { detached: true, stdio: "ignore" }).unref();
        return true;
      }
    } catch (e) {
      // Ignore errors (e.g. if 'which' fails)
    }
    return false;
  }
}

export default AppUpdater;
