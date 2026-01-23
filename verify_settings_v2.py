
from playwright.sync_api import sync_playwright

def verify_settings():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={'width': 1280, 'height': 800}
        )
        page = context.new_page()

        # Inject localStorage to skip onboarding
        page.add_init_script("""
            localStorage.setItem('hasSeenOnboarding', 'true');
            localStorage.setItem('hasSeenVersion', '9.9.9');
        """)

        print("Navigating to app...")
        page.goto("http://localhost:3000")

        # Wait a bit for initial load
        page.wait_for_timeout(3000)

        # Force removal of loading screen and driver overlays if they stick
        page.evaluate("""
            const loader = document.getElementById('initial-loader');
            if (loader) loader.remove();

            // Remove driver.js overlays
            document.querySelectorAll('.driver-overlay').forEach(e => e.remove());
            document.querySelectorAll('.driver-popover').forEach(e => e.remove());

            // Remove driver-active class from body
            document.body.classList.remove('driver-active');
            document.body.classList.remove('driver-fade');
        """)

        page.wait_for_timeout(1000)

        # Try to dismiss any modals
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)

        page.screenshot(path="/home/jules/verification/main_page_loaded.png")

        # Wait for settings button and click
        # The settings button usually has a cog icon or is in the top right
        # Based on previous analysis, there is a button that opens settings.
        # I'll look for a button with SVG path or specific class/ID if I knew it.
        # Assuming it's easily findable.
        # In the layout, there is a settings button in the top nav.

        # Let's try to find it by icon or aria-label if added.
        # If not, I might need to trigger the state manually or guess the selector.
        # Previous script used: page.locator("button.p-2.rounded-lg").nth(3).click() or similar.
        # Let's try to be more robust. The settings button is likely near the top right.

        print("Opening Settings...")
        page.screenshot(path="/home/jules/verification/main_page_debug.png")

        # Try to find the settings button by aria-label or title
        try:
            print("Trying to find settings button by label...")
            page.get_by_label("Settings").click(timeout=2000)
        except:
            print("Label not found. Trying by title...")
            try:
                page.get_by_title("Settings").click(timeout=2000)
            except:
                print("Title not found. Trying by icon (SVG)...")
                # Look for the gear icon SVG path
                # Common gear path starts often like 'M10.325 4.317c.426-5.441 3.849-6.802 7.348-4.056...' or similar
                # But let's just try clicking buttons from the right side of the header
                buttons = page.locator("header button").all()
                if buttons:
                    # Settings is usually 4th from right (GitHub, Discord, Help, Settings)
                    print(f"Found {len(buttons)} header buttons. Clicking 4th from last.")
                    if len(buttons) >= 4:
                        buttons[-4].click()
                    else:
                        print("Not enough buttons, trying last.")
                        buttons[-1].click()

        # Wait for dialog
        page.wait_for_selector("#settings-title", timeout=5000)

        # 1. Capture Robot Tab (Default)
        print("Capturing Robot Tab...")
        page.screenshot(path="/home/jules/verification/settings_robot_v2.png")

        # 2. Click General and Capture
        print("Navigating to General...")
        page.get_by_text("General").click()
        page.wait_for_timeout(500) # Wait for transition
        page.screenshot(path="/home/jules/verification/settings_general_v2.png")

        # 3. Click About and Capture
        print("Navigating to About...")
        page.get_by_text("About").click()
        page.wait_for_timeout(500)
        page.screenshot(path="/home/jules/verification/settings_about_v2.png")

        browser.close()

if __name__ == "__main__":
    verify_settings()
