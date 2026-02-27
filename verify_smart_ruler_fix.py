import time
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        print("Navigating to app...")
        page.goto("http://localhost:4173")

        # 1. Handle "What's New" Dialog
        print("Waiting for potential 'What's New' dialog...")
        try:
            # Wait a bit for the animation/startup
            page.wait_for_timeout(2000)

            # Check for the dialog header or close button
            # The dialog has a title with "What's New" or similar
            whats_new_close = page.locator("button[aria-label='Close']")
            if whats_new_close.count() > 0 and whats_new_close.first.is_visible():
                print("Dismissing 'What's New' dialog...")
                whats_new_close.first.click()
                page.wait_for_timeout(1000) # Wait for fade out
            else:
                print("'What's New' dialog not found or not visible.")
        except Exception as e:
            print(f"Error handling What's New: {e}")

        # 2. Handle Onboarding (Driver.js)
        # Driver.js usually adds a class or element. We can try to click "Done" or "Skip" or just Escape.
        print("Attempting to dismiss Onboarding via Escape...")
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        page.keyboard.press("Escape") # Twice to be sure

        # 3. Open View Options
        print("Opening View Options...")
        # The View Options button usually has a specific icon or ID.
        # Based on previous context, it might be in the Navbar or ControlTab.
        # Let's try to find the button that toggles the ruler.
        # It seems the Ruler toggle is inside a menu (View Options).

        # In MathTools.svelte, the ruler isn't a global toggle in the navbar usually,
        # it's often a tool in a toolbar.
        # Wait, looking at MathTools.svelte (I read it earlier in exploration, let me re-verify where it is used).
        # MathTools.svelte is likely imported in FieldRenderer.svelte or similar?
        # Actually, let's check where MathTools is used.

        # Re-reading list_files output... src/lib/MathTools.svelte exists.
        # Let's check src/lib/components/FieldRenderer.svelte to see if it includes MathTools.

        # For now, I'll assume I need to find the "View Options" button.
        # I'll take a screenshot first to see where we are.
        page.screenshot(path="debug_state_clean.png")

        try:
            # Search for the "View Options" button.
            view_options_btn = page.locator("button:has-text('View Options')")
            if view_options_btn.count() > 0:
                view_options_btn.click()
            else:
                # Try icon based?
                # Let's try to find the Ruler toggle directly if it's visible?
                # Maybe it's hidden behind the "View Options" dropdown.
                # Let's look for the dropdown trigger.
                # In many of these apps, it's a "eye" icon or similar.
                pass

        except Exception as e:
            print(f"Error interacting with View Options: {e}")

        # Let's try to find the "Ruler" checkbox/toggle.
        print("Looking for Ruler toggle...")
        try:
            # It might be in a dropdown, so we might need to click the dropdown first.
            # Assuming "View Options" is the text or tooltip.

            # Use a broad selector to find the toggle if it's visible
            ruler_toggle = page.get_by_text("Ruler", exact=True)
            if ruler_toggle.is_visible():
                ruler_toggle.click()
                print("Clicked Ruler toggle.")
            else:
                # If not visible, maybe we need to open the menu.
                # Try finding a button with 'View Options' title oraria-label
                menu_btn = page.locator("button[title='View Options']")
                if not menu_btn.is_visible():
                     menu_btn = page.locator("button:has(svg.lucide-eye)") # Common icon for view options

                if menu_btn.count() > 0:
                     menu_btn.first.click()
                     print("Clicked View Options menu.")
                     page.wait_for_timeout(500)
                     page.get_by_text("Ruler").click()
                     print("Clicked Ruler toggle inside menu.")
                else:
                    print("Could not find View Options menu.")

        except Exception as e:
            print(f"Error toggling ruler: {e}")

        # 4. Verify Ruler Elements
        print("Verifying Ruler elements...")
        try:
            # We expect two handles (circles) and a line, and now text labels.
            # The new text labels should contains "ΔX", "ΔY", "∠".

            # Wait for the ruler endpoint to appear (default 10s wait)
            page.locator("circle[aria-label='Ruler end point']").first.wait_for(timeout=5000)

            # Drag one endpoint to create a measurement
            # The ruler usually starts at 0,0 or center.
            # Let's drag the second handle.
            handles = page.locator("circle[aria-label='Ruler end point']")
            if handles.count() >= 2:
                # Drag the second handle
                box = handles.nth(1).bounding_box()
                if box:
                    page.mouse.move(box['x'] + box['width']/2, box['y'] + box['height']/2)
                    page.mouse.down()
                    page.mouse.move(box['x'] + 100, box['y'] + 100) # Move diagonally
                    page.mouse.up()
                    print("Dragged ruler handle.")

            # Check for the new labels
            # We added text elements. They are inside the SVG.
            # We can check for text content in the page.

            time.sleep(1) # Wait for Reactivity

            content = page.content()
            if "ΔX:" in content and "ΔY:" in content and "∠" in content:
                print("SUCCESS: Smart Ruler labels found!")
            else:
                print("FAILURE: Smart Ruler labels NOT found in DOM.")
                # print(content) # Too verbose

            page.screenshot(path="smart_ruler_verified.png")

        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="smart_ruler_failed.png")

        browser.close()

if __name__ == "__main__":
    run()
