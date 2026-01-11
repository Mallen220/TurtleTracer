import time
from playwright.sync_api import sync_playwright

def verify_path_stats():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Increase viewport size to capture more content
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        try:
            page.goto("http://localhost:5173", timeout=20000)
        except Exception as e:
            print(f"Failed to load page: {e}")
            return

        # Wait for the app to load
        page.wait_for_timeout(2000)

        # Close "What's New" dialog if present
        try:
            close_btn = page.locator("button[aria-label='Close']").first
            if close_btn.is_visible():
                close_btn.click()
                print("Closed 'What's New' dialog.")
            else:
                 page.keyboard.press("Escape")
                 print("Pressed Escape to close dialog.")
        except Exception as e:
            print(f"Error closing dialog: {e}")

        page.wait_for_timeout(1000)

        # 1. Add a Rotate item.
        try:
            add_rotate_btn = page.get_by_role("button", name="Add Rotate")
            if add_rotate_btn.is_visible():
                add_rotate_btn.click()
                print("Clicked 'Add Rotate' button.")
            else:
                print("'Add Rotate' button not visible.")
        except Exception as e:
            print(f"Error adding rotate: {e}")

        page.wait_for_timeout(500)

        # 2. Open Path Statistics
        try:
            stats_btn = page.get_by_role("button", name="View path statistics")
            if not stats_btn.is_visible():
                 stats_btn = page.get_by_text("Stats", exact=True)

            if stats_btn.is_visible():
                stats_btn.click()
                print("Clicked 'Stats' button.")
            else:
                print("Stats button not found.")
        except Exception as e:
            print(f"Error opening stats: {e}")

        page.wait_for_timeout(1000)

        # Take a screenshot of the dialog
        page.screenshot(path="verification/path_stats_dialog.png")
        print("Screenshot saved to verification/path_stats_dialog.png")

        browser.close()

if __name__ == "__main__":
    verify_path_stats()
