from playwright.sync_api import sync_playwright

def verify_recent_files_sort(page):
    # Load the app
    page.goto("http://localhost:4173")

    # Open File Manager
    # Use the icon selector as it's an icon-only button
    file_manager_btn = page.get_by_title("File Manager")
    file_manager_btn.click()

    # Wait for animation
    page.wait_for_timeout(500)

    # Verify the "Sort by" controls exist
    # We expect "Recent", "Name", "Date" buttons
    page.get_by_role("button", name="Recent").wait_for(state="visible")
    page.get_by_role("button", name="Name").wait_for(state="visible")
    page.get_by_role("button", name="Date").wait_for(state="visible")

    # 1. Verify Default State (Recent)
    # The "Recent" button should be active (white bg, blue text)
    # We'll take a screenshot here
    page.screenshot(path="/home/jules/verification/filemanager_sort_recent.png")

    # 2. Switch to Name Sort
    page.get_by_role("button", name="Name").click()
    page.wait_for_timeout(300)

    # Verify Directory Info appears (only in non-Recent modes)
    page.get_by_text("Current Directory:").wait_for(state="visible")

    # Take another screenshot
    page.screenshot(path="/home/jules/verification/filemanager_sort_name.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        # Launch browser
        browser = p.chromium.launch()
        page = browser.new_page()

        try:
            verify_recent_files_sort(page)
            print("Verification script completed successfully.")
        except Exception as e:
            print(f"Verification failed: {e}")
        finally:
            browser.close()
