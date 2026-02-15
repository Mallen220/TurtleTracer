import time
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = context.new_page()

    # Open the app
    try:
        page.goto("http://localhost:5173")
        # Wait for loading screen to disappear
        page.wait_for_selector("div#loading-screen", state="hidden", timeout=10000)
        time.sleep(2)

        # Take initial screenshot
        page.screenshot(path="before_resize.png")

        # Close any dialogs
        print("Closing dialogs...")
        page.keyboard.press("Escape")
        time.sleep(1)
        page.keyboard.press("Escape")
        time.sleep(1)

        # Find the resizer handle
        # aria-label="Resize Sidebar"
        resizer = page.locator('button[aria-label="Resize Sidebar"]')

        # Check if it's visible
        if not resizer.is_visible():
            print("Resizer not visible.")
            # Maybe click somewhere to dismiss overlays?
            page.mouse.click(10, 10)
            time.sleep(1)

        if not resizer.is_visible():
             print("Resizer still not visible.")
             page.screenshot(path="resizer_not_visible.png")
             return

        print("Resizer found.")

        # Focus the resizer
        resizer.focus()
        print("Resizer focused.")

        # Press ArrowLeft to shrink the field pane (move divider left)
        # userFieldLimit is width of LEFT pane.
        # ArrowLeft decreases it.
        print("Pressing ArrowLeft...")
        for _ in range(20):
            page.keyboard.press("ArrowLeft")

        time.sleep(1)
        page.screenshot(path="after_resize_left.png")

        # Press ArrowRight to expand
        print("Pressing ArrowRight...")
        for _ in range(40):
            page.keyboard.press("ArrowRight")

        time.sleep(1)
        page.screenshot(path="after_resize_right.png")

        # Focus state check
        resizer.focus()
        time.sleep(0.5)
        page.screenshot(path="focused_resizer.png")
        print("Done.")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="error.png")
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
