from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://localhost:4173/")

        # Wait for load
        page.wait_for_timeout(2000) # Simple wait to ensure everything renders

        # Verify Skip to Start button
        start_btn = page.locator('button[aria-label="Skip to start"]')
        if start_btn.count() > 0 and start_btn.is_visible():
            print("Skip to Start button is visible")
        else:
            print("Skip to Start button is NOT visible")

        # Verify Skip to End button
        end_btn = page.locator('button[aria-label="Skip to end"]')
        if end_btn.count() > 0 and end_btn.is_visible():
            print("Skip to End button is visible")
        else:
            print("Skip to End button is NOT visible")

        # Take a screenshot of the playback controls
        # Locator for the playback controls container
        controls = page.locator("#playback-controls")
        if controls.count() > 0 and controls.is_visible():
            controls.screenshot(path="playback_controls_screenshot.png")
            print("Screenshot saved to playback_controls_screenshot.png")
        else:
            print("Playback controls container not found")
            page.screenshot(path="full_page_screenshot.png")

        browser.close()

if __name__ == "__main__":
    run()
