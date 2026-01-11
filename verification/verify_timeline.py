from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        page.goto("http://localhost:5173")
        page.wait_for_selector("text=Paths")
        page.wait_for_selector("#loading-screen", state="hidden")
        try:
             page.keyboard.press("Escape")
        except:
             pass
        page.wait_for_timeout(1000)

        # Add Path
        page.get_by_role("button", name="Add Path").first.click()

        # Add Wait
        page.get_by_role("button", name="Add wait command").click()

        # Add Rotate
        page.get_by_role("button", name="Add rotate command").click()

        # Add Event Marker
        # "Event Markers" might be hidden or text is different.
        # "Event Markers (0)" is the text.
        # Let's verify the text is present first.
        # It's inside a button, but maybe the button is collapsed?
        # The button has title="Hide event markers" or "Show event markers" depending on state.

        # Try finding by title
        markers_btn = page.locator("button[title*='event markers']").first
        if markers_btn.count() > 0:
             markers_btn.click()
             page.wait_for_timeout(500)
             # Now find "Add Marker"
             page.locator("button", has_text="Add Marker").first.click()
        else:
             print("Could not find Event Markers button")

        page.wait_for_timeout(500)

        page.screenshot(path="verification/timeline_full.png")

        controls = page.locator("input[type=range][aria-label='Animation progress']").locator("..").locator("..")
        if controls.count() > 0:
            controls.screenshot(path="verification/timeline_controls.png")

        print("Screenshots taken")
        browser.close()

if __name__ == "__main__":
    run()
