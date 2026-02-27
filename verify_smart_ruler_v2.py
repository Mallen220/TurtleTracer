import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:4173")

        # 1. Handle "What's New" Dialog (Aggressive)
        print("Handling dialogs...")
        try:
            # Wait for dialog to appear if it's going to
            page.wait_for_timeout(3000)

            # Try finding the close button specifically within the dialog
            close_btn = page.locator("div[role='dialog'] button[aria-label='Close']")
            if close_btn.count() > 0 and close_btn.first.is_visible():
                print("Dismissing 'What's New' dialog...")
                close_btn.first.click()
                page.wait_for_timeout(1000)
            else:
                print("No 'What's New' dialog found.")
        except Exception as e:
            print(f"Error handling What's New: {e}")

        # 2. Handle Onboarding
        print("Dismissing Onboarding...")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        page.keyboard.press("Escape")

        # 3. Enable Ruler
        print("Enabling Ruler...")
        try:
            # Open menu
            menu_btn = page.locator("button[title='View Options']")
            if not menu_btn.is_visible():
                 menu_btn = page.locator("button:has(svg.lucide-eye)")

            # Ensure menu button is clickable (no overlays)
            if menu_btn.count() > 0:
                 menu_btn.first.click(force=True) # Force click to bypass checks if needed (though risky)
                 page.wait_for_timeout(500)

                 ruler_option = page.get_by_text("Ruler")
                 if ruler_option.is_visible():
                     ruler_option.click()
                     print("Clicked Ruler toggle.")
                 else:
                     print("Ruler option not visible after clicking menu.")

                 # Close menu by clicking elsewhere (e.g. top left safe zone)
                 page.mouse.click(10, 10)
            else:
                print("Could not find View Options menu.")
        except Exception as e:
            print(f"Error toggling ruler: {e}")

        # 4. Verify Ruler Elements
        print("Verifying Ruler elements...")
        try:
            # Wait for ruler
            page.locator("circle[aria-label='Ruler end point']").first.wait_for(timeout=5000)

            # Drag to ensure diagonal (so Delta Y appears)
            handles = page.locator("circle[aria-label='Ruler end point']")
            if handles.count() >= 2:
                print("Found handles, attempting drag...")
                # Get the second handle (end point)
                handle = handles.nth(1)
                box = handle.bounding_box()
                if box:
                    # Hover and mouse down
                    cx = box['x'] + box['width']/2
                    cy = box['y'] + box['height']/2
                    page.mouse.move(cx, cy)
                    page.mouse.down()
                    page.wait_for_timeout(200) # Wait for event

                    # Move diagonally
                    page.mouse.move(cx - 100, cy + 100, steps=10)
                    page.wait_for_timeout(200)
                    page.mouse.up()
                    print("Drag completed.")

            page.wait_for_timeout(1000) # Wait for Vue/Svelte update
            page.screenshot(path="smart_ruler_final_check_v2.png")

            content = page.content()

            # Check for labels (correct casing from source code)
            # Source: Δx, Δy, °
            has_dx = "Δx:" in content
            has_dy = "Δy:" in content
            has_angle = "°" in content

            if has_dx:
                print("SUCCESS: Found 'Δx:' label.")
            else:
                print("FAILURE: 'Δx:' label missing.")

            if has_dy:
                print("SUCCESS: Found 'Δy:' label.")
            else:
                print("WARNING: 'Δy:' label missing (drag might have failed).")

            if has_angle:
                print("SUCCESS: Found degree symbol '°'.")
            else:
                print("FAILURE: Degree symbol missing.")

            if has_dx and has_angle:
                print("OVERALL SUCCESS: Smart Ruler labels verified.")
            else:
                print("OVERALL FAILURE: Missing critical labels.")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="smart_ruler_failed_v2.png")

        browser.close()

if __name__ == "__main__":
    run()
