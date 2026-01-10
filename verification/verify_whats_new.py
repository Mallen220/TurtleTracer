
from playwright.sync_api import sync_playwright, expect

def test_whats_new_dialog(page):
    # Go to the app
    page.goto("http://localhost:5173")

    # Wait for loading
    try:
        page.wait_for_selector("#loading-screen", state="detached", timeout=5000)
    except:
        pass

    page.wait_for_timeout(1000)

    # Open dialog
    page.keyboard.press("Shift+N")

    # Wait for dialog
    dialog = page.get_by_role("dialog", name="What's New")
    expect(dialog).to_be_visible(timeout=5000)

    # Take screenshot of the main grid view
    page.screenshot(path="verification/whats_new_grid.png")

    # Test Search
    search_input = page.get_by_placeholder("Search...")
    search_input.fill("version")

    # Wait for search results
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/whats_new_search.png")

    # Clear search
    search_input.fill("")

    # Navigate to Release Notes
    page.get_by_role("button", name="Release Notes").click()

    # Wait for list view
    page.wait_for_timeout(1000)
    page.screenshot(path="verification/whats_new_release_list.png")

    # Click a feature (e.g. the first one)
    page.get_by_role("button", name="Version 2.0.0 Highlights").click()

    # Wait for content
    page.wait_for_timeout(1000)

    # Check that the dialog title matches the feature title
    expect(page.get_by_role("heading", name="Version 2.0.0 Highlights")).to_be_visible()

    # Check content text presence
    expect(page.get_by_text("What's New in 2.0.0")).to_be_visible()

    page.screenshot(path="verification/whats_new_content.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            test_whats_new_dialog(page)
        finally:
            browser.close()
