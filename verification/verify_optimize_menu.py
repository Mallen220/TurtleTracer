from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()
    page = context.new_page()

    try:
        page.goto("http://localhost:4173")
        page.wait_for_timeout(3000)

        # Close dialogs
        for _ in range(5):
            page.keyboard.press("Escape")
            page.wait_for_timeout(200)

        # Click Table tab
        print("Clicking Table tab...")
        table_tab = page.get_by_role("tab", name="Table")
        table_tab.click()
        page.wait_for_timeout(1000)

        # Wait for "Start Point"
        print("Waiting for Start Point...")
        page.get_by_role("cell", name="Start Point").wait_for(timeout=5000)

        # Add paths
        print("Adding paths...")
        add_path_btn = page.get_by_label("Add new path segment")
        # Ensure we click the visible one
        add_path_btn.click()
        page.wait_for_timeout(500)
        add_path_btn.click()
        page.wait_for_timeout(500)

        # Open Optimize Dialog
        print("Opening Optimize Dialog...")
        optimize_btn = page.get_by_label("Optimize Path")
        optimize_btn.click()
        page.wait_for_timeout(1000)

        # Verify Dialog Content
        print("Verifying content...")
        header = page.get_by_text("Paths to Optimize")
        expect(header).to_be_visible()

        # Check checkboxes
        path1_cb = page.get_by_role("checkbox", name="Path 1")
        path2_cb = page.get_by_role("checkbox", name="Path 2")
        expect(path1_cb).to_be_visible()
        expect(path2_cb).to_be_visible()

        # Deselect path 2
        print("Deselecting Path 2...")
        path2_cb.click()
        page.wait_for_timeout(500)

        # Check that it is unchecked
        expect(path2_cb).not_to_be_checked()

        page.screenshot(path="verification/optimize_menu.png")
        print("Screenshot saved to verification/optimize_menu.png")

    except Exception as e:
        print(f"Error: {e}")
        page.screenshot(path="verification/error.png")
        raise e
    finally:
        browser.close()

with sync_playwright() as playwright:
    run(playwright)
