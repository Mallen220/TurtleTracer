
from playwright.sync_api import sync_playwright

def verify_whats_new():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # We need a context that allows local storage modification or mocking if needed
        # but for this specific task, we want to see the "What's New" dialog.
        # The app might show it automatically on first run, or we might need to trigger it.
        # Based on the code in App.svelte, there is a "triggerSetupDialog" available on window
        # or we can click the "What's New" button if it exists.

        page = browser.new_page()

        try:
            # Assume dev server is running on 5173 (Vite default)
            page.goto("http://localhost:5173")

            # Wait for app to load
            page.wait_for_load_state("networkidle")

            # The "What's New" dialog is usually triggered by a button in the help menu or settings
            # Let's look for a button with "What's New" text or similar.
            # Alternatively, force it open via JS if possible, but user interaction is better.

            # Try to find a "Help" or "Info" button first if needed,
            # but let's search for "What's New" directly first.

            # Checking App.svelte, it seems showWhatsNew is a state.
            # There is likely a button to toggle it.
            # Let's try to find a button with "What's New" or an icon.

            # If we can't find it easily, we can try to force it via the console for verification of the CONTENT.
            # The content is what we changed.

            # Attempt to trigger via console as a fallback/shortcut to verify the modal content
            page.evaluate("window.triggerSetupDialog ? window.triggerSetupDialog() : console.log(\"triggerSetupDialog not found\")")

            # Wait for the modal content to appear
            # We look for the text "What's New!" which is the header in the markdown
            # OR "Autosave is Here!" which is our new content.

            # Wait for our specific new content to be visible
            expect_text = "Autosave is Here!"
            page.wait_for_selector(f"text={expect_text}", timeout=5000)

            print("Found new content!")

            # Take a screenshot of the dialog
            page.screenshot(path="verification/whats_new_dialog.png")

        except Exception as e:
            print(f"Error: {e}")
            # Take a screenshot of the failure state
            page.screenshot(path="verification/error_state.png")

        browser.close()

if __name__ == "__main__":
    verify_whats_new()
