// Copyright 2026 Matthew Allen. Licensed under the Modified Apache License, Version 2.0.
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

  async checkForUpdates(manual = false) {
    try {
      // Check if running in Microsoft Store context
      if (process.windowsStore) {
        console.log(
          "Running in Microsoft Store context. Skipping GitHub update check.",
        );
        return { updateAvailable: false, reason: "store" };
      }

      console.log("Checking for updates...");

      // GitHub API URL for your repository releases
      const repoUrl =
        "https://api.github.com/repos/Mallen220/PedroPathingPlusVisualizer/releases/latest";

      const response = await fetch(repoUrl);

      if (!response.ok) {
        throw new Error(`GitHub API responded with status: ${response.status}`);
      }

      const releaseData = await response.json();
      const latestVersion = releaseData.tag_name.replace("v", "");

      console.log(`Current: ${this.currentVersion}, Latest: ${latestVersion}`);

      // Check if this version was skipped
      if (!manual) {
        const skippedVersions = this.loadSkippedVersions();
        if (skippedVersions.includes(latestVersion)) {
          console.log(`Version ${latestVersion} was previously skipped.`);
          return { updateAvailable: false, reason: "skipped" };
        }
      }

      if (this.isNewerVersion(latestVersion, this.currentVersion)) {
        this.showUpdateAvailableDialog(releaseData, manual ? 0 : 3000);
        return { updateAvailable: true, version: latestVersion, releaseData };
      } else {
        console.log("Application is up to date.");
        return { updateAvailable: false, reason: "latest" };
      }
    } catch (error) {
      console.error("Failed to check for updates:", error);
      // Don't show error to user on startup to avoid annoyance
      if (manual) throw error;
      return { updateAvailable: false, error: error.message };
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

  async showUpdateAvailableDialog(releaseData, delay = 3000) {
    // Wait a bit for the main window to be fully ready
    setTimeout(() => {
      const version = releaseData.tag_name.replace("v", "");
      if (this.mainWindow && this.mainWindow.webContents) {
        this.mainWindow.webContents.send("update-available", {
          version: version,
          releaseNotes: releaseData.body,
          url: releaseData.html_url,
        });
      }
    }, delay);
  }

  skipVersion(version) {
    const skippedVersions = this.loadSkippedVersions();
    if (!skippedVersions.includes(version)) {
      skippedVersions.push(version);
      this.saveSkippedVersions(skippedVersions);
      console.log(`User skipped version ${version}`);
    }
  }

  handleDownloadAndInstall(version, releasesUrl) {
    try {
      if (process.platform === "win32") {
        const downloadUrl = `https://github.com/Mallen220/PedroPathingPlusVisualizer/releases/download/v${version}/Pedro-Pathing-Plus-Visualizer-Setup-${version}.exe`;
        shell.openExternal(downloadUrl);
      } else if (process.platform === "darwin") {
        const command =
          "curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingPlusVisualizer/main/install.sh | bash";
        const appleScript = `tell application "Terminal" to do script "${command}"`;
        spawn("osascript", ["-e", appleScript]);
        spawn("osascript", ["-e", 'tell application "Terminal" to activate']);
      } else if (process.platform === "linux") {
        const command =
          "curl -fsSL https://raw.githubusercontent.com/Mallen220/PedroPathingPlusVisualizer/main/install.sh | bash";
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
