import { dialog, app, shell } from "electron";

class AppUpdater {
  constructor(mainWindow) {
    this.mainWindow = mainWindow;
    this.currentVersion = app.getVersion();
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

  async showUpdateAvailableDialog(releaseData) {
    // Wait a bit for the main window to be fully ready
    setTimeout(() => {
      const result = dialog.showMessageBoxSync(this.mainWindow, {
        type: "info",
        title: "Update Available",
        message: `A new version of Pedro Pathing Visualizer is available!`,
        detail: `Current version: ${this.currentVersion}\nLatest version: ${releaseData.tag_name}\n\n\nWould you like to download the update?`,
        buttons: ["Download Update", "Skip This Version", "Remind Me Later"],
        defaultId: 0,
        cancelId: 2,
      });

      switch (result) {
        case 0: // Download Update
          shell.openExternal(releaseData.html_url);
          break;
        case 1: // Skip This Version
          // You could store this in settings to skip future notifications for this version
          console.log(`User skipped version ${releaseData.tag_name}`);
          break;
        case 2: // Remind Me Later
          // Do nothing, will check again on next startup
          break;
      }
    }, 3000);
  }
}

export default AppUpdater;
