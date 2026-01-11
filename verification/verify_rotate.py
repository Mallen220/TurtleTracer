import time
from playwright.sync_api import sync_playwright

def test_add_rotate_features():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        try:
            page.goto("http://localhost:5173")

            # Wait for the app to load
            page.wait_for_selector("text=Path 1", timeout=10000)

            # Force click to dismiss any modal/overlay
            page.mouse.click(10, 10)
            page.keyboard.press("Escape")
            time.sleep(2)

            # Try to force remove the blocking modal if it exists
            page.evaluate("document.querySelectorAll('[role=dialog]').forEach(e => e.remove())")
            time.sleep(1)

            # Test adding rotate at start
            # There are two "Add Rotate" buttons. The first one should be the one at the start.
            page.click("text=Add Rotate >> nth=0")

            # Screenshot after adding rotate at start
            page.screenshot(path="verification/1_add_rotate_at_start.png")

            # Refresh to clean state
            page.reload()
            page.wait_for_selector("text=Path 1", state="visible", timeout=10000)
            page.keyboard.press("Escape")
            page.evaluate("document.querySelectorAll('[role=dialog]').forEach(e => e.remove())")
            time.sleep(1)

            # 2. Add Rotate After Path
            # Find the "Add Rotate After" button. It should be in the path section.
            path_rotate_btn = page.locator("button[title='Add Rotate After']").first
            if path_rotate_btn.is_visible():
                path_rotate_btn.click()
            else:
                print("Could not find Add Rotate After button for Path")

            page.screenshot(path="verification/2_add_rotate_after_path.png")

            # 3. Add Rotate After Wait
            # Add a wait first
            add_wait_btns = page.locator("text=Add Wait")
            add_wait_btns.last.click()

            # Find the "Add Rotate After" button for the wait.
            wait_rotate_btn = page.locator("button[title='Add Rotate After']").last
            if wait_rotate_btn.is_visible():
                wait_rotate_btn.click()
            else:
                 print("Could not find Add Rotate After button for Wait")

            page.screenshot(path="verification/3_add_rotate_after_wait.png")

            print("Verification script completed.")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")
        finally:
            browser.close()

if __name__ == "__main__":
    test_add_rotate_features()
