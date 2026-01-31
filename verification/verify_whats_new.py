from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 720})

    print("Navigating to app...")
    page.goto("http://localhost:4173/")

    # Wait for app to load
    page.wait_for_load_state("networkidle")

    print("Pressing Shift+N to open What's New...")
    page.keyboard.press("Shift+N")

    # Wait for dialog to open
    page.wait_for_selector("#whats-new-title")

    # Check for the new content
    print("Checking for new content...")

    # Try to navigate to "Latest Highlights" if in grid view
    try:
        # Wait a bit for grid to render
        page.wait_for_timeout(1000)

        # Look for the card with "Latest Highlights"
        latest = page.get_by_role("heading", name="Latest Highlights")
        if latest.is_visible():
            latest.click()
            print("Clicked Latest Highlights")
    except Exception as e:
        print(f"Navigation note: {e}")

    # Now check for the content text headers
    # Live Code Preview is an H3 in markdown, so likely rendered as H3
    expect(page.get_by_role("heading", name="Live Code Preview")).to_be_visible()
    expect(page.get_by_role("heading", name="Export Improvements")).to_be_visible()

    # Check for specific text content
    expect(page.get_by_text("Real-time Code Generation")).to_be_visible()
    expect(page.get_by_text("Direct Download")).to_be_visible()

    print("Taking screenshot...")
    page.screenshot(path="verification/whats_new.png")

    browser.close()

if __name__ == "__main__":
    with sync_playwright() as playwright:
        run(playwright)
