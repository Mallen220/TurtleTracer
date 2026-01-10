import { _electron as electron } from 'playwright';
import path from 'path';
import fs from 'fs';

async function run() {
  // Launch Electron application
  const electronApp = await electron.launch({
    args: ['.'],
    env: {
       ...process.env,
       NODE_ENV: 'development'
    }
  });

  // Get the first window
  const window = await electronApp.firstWindow();

  // Wait for app to load
  await window.waitForLoadState('domcontentloaded');

  try {
    // 1. Check if "What's New" dialog is visible
    const dialogTitle = window.getByRole('heading', { name: "What's New" });

    if (!await dialogTitle.isVisible()) {
        console.log("What's New dialog not initially visible. Looking for trigger...");
        await window.waitForTimeout(2000);
    }

    if (await dialogTitle.isVisible()) {
        console.log("What's New dialog found!");

        // Take a screenshot of the main grid view
        await window.screenshot({ path: 'verification/whats_new_grid.png' });

        // 2. Click "Recent Highlights"
        await window.getByText('Recent Highlights').click();
        await window.waitForTimeout(500); // Wait for transition
        await window.screenshot({ path: 'verification/recent_highlights.png' });

        // Go back - target the button inside the WhatsNewDialog
        // There is a back button in the header
        await window.locator('button[aria-label="Back"]').first().click();
        await window.waitForTimeout(500);

        // 3. Click "Getting Started"
        await window.getByText('Getting Started').click();
        await window.waitForTimeout(500);
        await window.screenshot({ path: 'verification/getting_started.png' });

        // Go back
        await window.locator('button[aria-label="Back"]').first().click();
        await window.waitForTimeout(500);

        // 4. Click "Full Changelog" button (in the grid)
        await window.getByRole('button', { name: 'Full Changelog' }).click();
        await window.waitForTimeout(500);
        await window.screenshot({ path: 'verification/full_changelog.png' });

        // Switch back to home
         await window.locator('button[aria-label="Back"]').first().click();
         await window.waitForTimeout(500);
         await window.screenshot({ path: 'verification/back_to_home.png' });

    } else {
        console.log("Could not find What's New dialog. Taking screenshot of main window.");
        await window.screenshot({ path: 'verification/main_window.png' });
    }

  } catch (error) {
    console.error("Error during verification:", error);
    await window.screenshot({ path: 'verification/error.png' });
  } finally {
    await electronApp.close();
  }
}

run();
