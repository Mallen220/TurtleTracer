import time
from playwright.sync_api import sync_playwright, expect

def verify_frontend():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # Increase viewport to see more
        page = browser.new_page(viewport={'width': 1280, 'height': 800})

        print("Navigating to http://localhost:8080...")
        page.goto("http://localhost:8080")

        # Wait for loading screen to disappear
        print("Waiting for loading screen to disappear...")
        try:
            page.wait_for_selector("#loading-screen", state="hidden", timeout=10000)
        except:
            print("Loading screen wait timeout, proceeding...")

        time.sleep(2)

        # Check for and close the "What's New" dialog
        try:
            # The dialog has an aria-label "whats-new-title" or similar based on logs
            # <div role="dialog" aria-modal="true" aria-labelledby="whats-new-title" ...>
            dialog = page.locator("div[role='dialog']")
            if dialog.is_visible():
                print("Dialog detected. Attempting to close...")
                # Try to find a close button inside the dialog
                # Usually an 'X' button or something.
                # Look for a button with an SVG inside or similar, or just press Escape
                page.keyboard.press("Escape")
                time.sleep(1)

                if dialog.is_visible():
                     print("Dialog still visible after Escape, trying close button...")
                     # Searching for a button that might be the close button.
                     # Often top right.
                     close_btn = dialog.locator("button").first
                     close_btn.click()
                     time.sleep(1)
        except Exception as e:
            print(f"Error handling dialog: {e}")

        # Now try to verify changes

        # 1. PathLineSection: "Target Position" span
        # We need to make sure the sidebar for Path 1 is visible.
        # Try to click the "Path 1" text to expand it if needed.
        # Use get_by_role button if it's the accordion toggle
        try:
            # The accordion toggle button has text "Path 1" inside it.
            # <button ... title="Collapse path"> ... Path 1 ... </button>
            # Or "Expand path"
            path_toggle = page.locator("button", has_text="Path 1").first
            if path_toggle.is_visible():
                # If "Target Position" is not visible, click toggle
                if not page.get_by_text("Target Position").is_visible():
                     print("Clicking Path 1 toggle")
                     path_toggle.click()
                     time.sleep(0.5)

            target_pos = page.get_by_text("Target Position")
            if target_pos.is_visible():
                print("Target Position text is visible.")
                tag_name = target_pos.evaluate("el => el.tagName")
                print(f"Target Position tag: {tag_name}")
                # Expect SPAN
                if tag_name == "SPAN":
                    print("SUCCESS: Target Position is a SPAN.")
                else:
                    print(f"FAILURE: Target Position is {tag_name}")

                page.screenshot(path="verification_sidebar.png")
            else:
                 print("Target Position text NOT visible.")

        except Exception as e:
            print(f"Error verifying PathLineSection: {e}")

        # 2. Verify Wait Section
        try:
            # Click "Wait" button to add a wait.
            # It's inside the PathLineSection, so it should be visible now.
            # Button "Add Wait After"
            add_wait_btn = page.locator("button[title='Add Wait After']").first
            add_wait_btn.scroll_into_view_if_needed()
            add_wait_btn.click()
            print("Clicked Add Wait After")
            time.sleep(1)

            # Verify "Duration (ms)" label
            duration_label = page.get_by_text("Duration (ms)")
            if duration_label.is_visible():
                print("Duration (ms) label visible")

                # Check association
                # Get the 'for' attribute
                for_attr = duration_label.get_attribute("for")
                print(f"Label for attribute: {for_attr}")

                # Find input with that id
                if for_attr:
                    inp = page.locator(f"#{for_attr}")
                    if inp.is_visible():
                        print(f"SUCCESS: Found input with id {for_attr}")
                    else:
                        print(f"FAILURE: Input with id {for_attr} not found/visible")
                else:
                    print("FAILURE: Label has no 'for' attribute")

                page.screenshot(path="verification_wait.png")
            else:
                print("Duration (ms) label NOT visible")

        except Exception as e:
            print(f"Error verifying WaitSection: {e}")

        # 3. Verify Rotate Section
        try:
            # Click "Rotate" button to add a rotate.
            add_rotate_btn = page.locator("button[title='Add Rotate After']").first
            add_rotate_btn.scroll_into_view_if_needed()
            add_rotate_btn.click()
            print("Clicked Add Rotate After")
            time.sleep(1)

            # Verify "Heading (deg)" label
            heading_label = page.get_by_text("Heading (deg)").last # last one because Path section also has "Heading"
            if heading_label.is_visible():
                 print("Heading (deg) label visible")
                 for_attr = heading_label.get_attribute("for")
                 print(f"Label for attribute: {for_attr}")

                 if for_attr:
                    inp = page.locator(f"#{for_attr}")
                    if inp.is_visible():
                        print(f"SUCCESS: Found input with id {for_attr}")
                    else:
                        print(f"FAILURE: Input with id {for_attr} not found/visible")
                 else:
                     # Note: PathLineSection "Heading" uses <span> so it won't have 'for'.
                     # RotateSection "Heading (deg)" uses <label>.
                     # We need to make sure we got the right one.
                     # The text is different: "Heading" vs "Heading (deg)"
                     # "Heading (deg)" is unique to RotateSection (and WaitSection doesn't have heading)
                     print("FAILURE: Label has no 'for' attribute")

                 page.screenshot(path="verification_rotate.png")
        except Exception as e:
             print(f"Error verifying RotateSection: {e}")

        browser.close()

if __name__ == "__main__":
    verify_frontend()
