from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:5173")

        # Wait for app to load
        page.wait_for_timeout(2000)

        # Try to dismiss tutorial
        page.keyboard.press("Escape")
        page.wait_for_timeout(500)
        page.keyboard.press("Escape") # Twice to be sure
        page.wait_for_timeout(500)

        # Ensure we have a path. Click "Add Path" just in case, or "New Project" clears it.
        # Assuming default state has 0 paths or 1 path.
        # Let's try to find "Add Path" button.
        add_path = page.get_by_label("Add new path segment")
        if add_path.count() > 0:
            try:
                add_path.first.click(timeout=2000)
            except:
                # Maybe obscured, try force click
                add_path.first.click(force=True)

        # Now find the "Control Points" section for the path.
        # There might be multiple. We'll take the first one.
        # Button title contains "Show control points"
        # We need to use CSS selector because title might change based on state (Show/Hide)
        # But we know it contains "control points"

        # Try to find the collapsed button
        show_cp_btns = page.locator('button[title*="control points"]')
        if show_cp_btns.count() > 0:
            show_cp_btn = show_cp_btns.first
            # If it says "Show", click it. If "Hide", it's already expanded.
            title = show_cp_btn.get_attribute("title")
            if "Show" in str(title):
                show_cp_btn.click()

        # Add two control points
        add_cp_btns = page.get_by_label("Add Control Point")
        if add_cp_btns.count() > 0:
            add_cp_btn = add_cp_btns.first
            add_cp_btn.click()
            page.wait_for_timeout(200)
            add_cp_btn.click()
            page.wait_for_timeout(200)

        # Now we have points.
        # Find "Move control point up" button for the SECOND point (index 1).

        # Focus the "Move control point up" button of the second point.
        move_up_btns = page.get_by_label("Move control point up")

        if move_up_btns.count() >= 2:
            target_btn = move_up_btns.nth(1)
            target_btn.focus()

            # Wait a bit for transition
            page.wait_for_timeout(500)

            # Take screenshot
            page.screenshot(path="verification/focus_visible.png")
        else:
            print("Could not find enough control points buttons")
            page.screenshot(path="verification/debug.png")

        browser.close()

if __name__ == "__main__":
    run()
