from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_command_palette(page: Page):
    # 1. Navigate to the app
    page.goto("http://localhost:4173")

    # Wait for the app to load (checking for canvas or a known element)
    # page.wait_for_selector("canvas", timeout=10000)
    # Giving it a moment to fully initialize
    time.sleep(2)

    # 2. Open Command Palette
    # Try Cmd+P (Meta+P) or Ctrl+P
    page.keyboard.press("Control+p")

    # Wait for command palette input to be visible
    input_selector = "input[placeholder='Type a command or search...']"
    page.wait_for_selector(input_selector, timeout=5000)

    # 3. Type "Zoom" to search
    page.fill(input_selector, "Zoom")

    # 4. Verify "Zoom to Fit" is present
    # It should be in the list
    expect(page.get_by_text("Zoom to Fit")).to_be_visible()

    # 5. Take screenshot of filtered results
    page.screenshot(path="verification/command_palette_zoom.png")

    # 6. Clear search and type "Toggle Ghost"
    page.fill(input_selector, "")
    page.fill(input_selector, "Ghost")

    # 7. Verify "Toggle Ghost Paths" is present
    expect(page.get_by_text("Toggle Ghost Paths")).to_be_visible()

    # 8. Take another screenshot
    page.screenshot(path="verification/command_palette_ghost.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Set viewport to a reasonable size
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            verify_command_palette(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failure.png")
        finally:
            browser.close()
