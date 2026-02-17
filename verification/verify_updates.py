from playwright.sync_api import Page, expect, sync_playwright
import json

def test_updates_check(page: Page):

    # 1. Mock localStorage to skip onboarding (try to)
    page.add_init_script("""
        localStorage.setItem("pedro-settings", JSON.stringify({
            version: "1.0.0",
            settings: {
                hasSeenOnboarding: true,
                lastSeenVersion: "1.0.0"
            },
            lastUpdated: new Date().toISOString()
        }));
    """)

    # 2. Mock electronAPI and alert
    page.add_init_script("""
        window.electronAPI = {
            checkForUpdates: () => new Promise(resolve => setTimeout(() => resolve({ success: true, updateAvailable: false, reason: "latest" }), 100)),
            onUpdateAvailable: () => {},
            getAppDataPath: () => Promise.resolve("/tmp"),
            readFile: () => Promise.resolve("{}"),
            writeFile: () => Promise.resolve(true),
            fileExists: () => Promise.resolve(false),
            getSavedDirectory: () => Promise.resolve("/tmp/autopaths"),
            rendererReady: () => Promise.resolve(),
            onOpenFilePath: () => {},
            onAppCloseRequested: () => {},
            onMenuAction: () => {},
            isWindowsStore: () => Promise.resolve(false),
            getAppVersion: () => Promise.resolve("1.0.0"),
            listPlugins: () => Promise.resolve([]),
        };
        window.alert = (msg) => { window.__lastAlert = msg; };
    """)

    page.goto("http://localhost:4173/")
    page.wait_for_load_state("networkidle")

    # Try to close "What's New" dialog if present
    try:
        # Wait a bit for dialog to animate in
        page.wait_for_timeout(1000)

        close_btn = page.locator("button[aria-label='Close']")
        if close_btn.count() > 0:
            print(f"Found {close_btn.count()} close buttons. Clicking them...")
            for i in range(close_btn.count()):
                btn = close_btn.nth(i)
                if btn.is_visible():
                    btn.click()
                    page.wait_for_timeout(500)
    except Exception as e:
        print(f"Error closing dialog: {e}")

    # Remove driver overlay if present
    try:
        # Check if overlay exists
        if page.locator(".driver-overlay").count() > 0:
            print("Removing driver overlay")
            page.evaluate("""
                document.querySelectorAll('.driver-overlay').forEach(e => e.remove());
                document.querySelectorAll('.driver-active-element').forEach(e => e.classList.remove('driver-active-element'));
            """)
    except Exception as e:
        print(f"Error removing overlay: {e}")

    # Also try Escape again
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    page.screenshot(path="verification/after_closing_dialog.png")

    # Find Settings button
    settings_btn = page.get_by_label("Settings")
    expect(settings_btn).to_be_visible()

    # Click it
    print("Clicking Settings button...")
    settings_btn.click()

    page.wait_for_timeout(1000)

    # Find dialog
    settings_dialog = page.get_by_role("dialog", name="Settings")
    expect(settings_dialog).to_be_visible()

    # The General tab is default, so we should see the "Check for Updates" button
    check_updates_btn = page.get_by_role("button", name="Check for Updates")
    expect(check_updates_btn).to_be_visible()

    # Take a screenshot of the settings dialog with the button
    page.screenshot(path="verification/settings_updates.png")

    # Click the button
    check_updates_btn.click()

    # Wait for the alert
    # Since mocked checkForUpdates takes 100ms
    try:
        page.wait_for_function("window.__lastAlert !== undefined", timeout=5000)
    except Exception as e:
        print("Timeout waiting for alert. Dumping lastAlert value:")
        print(page.evaluate("window.__lastAlert"))
        raise e

    # Verify the alert message
    alert_msg = page.evaluate("window.__lastAlert")
    print(f"Alert message received: {alert_msg}")
    assert alert_msg == "You are on the newest version."

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_updates_check(page)
        finally:
            browser.close()
