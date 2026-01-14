
from playwright.sync_api import sync_playwright

def verify_whats_new():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto("http://localhost:5173")

            # Wait for app to load
            page.wait_for_load_state("networkidle")

            # Since the Setup Dialog is showing (based on previous screenshot),
            # we need to simulate a user bypassing it or we need to trick the app into thinking setup is done.
            # Or we can just mock the settings to say setup is done.

            # Inject code to force showWhatsNew = true and setupMode = false
            # But Svelte state is internal.

            # Alternative: The "Setup" dialog is actually the WhatsNewDialog in "setupMode".
            # The code says:
            # if (needsSetup || TEST_SETUP_DIALOG) {
            #   setupMode = true;
            #   showWhatsNew = true;
            # }

            # The screenshot shows "Welcome! Select Your AutoPaths Directory".
            # We want to see the "What's New" content, which requires setupMode = false.

            # We can try to manipulate the component state or local storage?
            # settingsStore is persisted.
            # But the backend check "needsSetup" comes from Electron API likely.

            # Let's try to click a button to open "What's New" if possible.
            # But the modal is blocking.

            # Code: openWhatsNew={() => (showWhatsNew = true)} passed to KeyboardShortcuts?
            # Wait, KeyboardShortcuts component has openWhatsNew prop?
            # It seems it binds keys to open it?

            # Actually, looking at the previous grep, openWhatsNew is passed to a component (likely Toolbar or Navbar, obscured by grep context).
            # Line 806: openWhatsNew={() => (showWhatsNew = true)}

            # If we are stuck in Setup Dialog, we might not be able to close it easily if we don't select a directory.
            # However, we can use the Mock Electron API trick from verify_setup.py to tell the app we HAVE a directory.

            # Let's inject the mock API again, but this time ensuring it returns a directory so "needsSetup" is false.

            page.add_init_script("""
                window.electronAPI = {
                    getSavedDirectory: async () => "/mock/path/AutoPaths", // Simulate EXISTING directory
                    getDirectory: async () => "/mock/path/AutoPaths",
                    setDirectory: async () => "/mock/path",
                    onMenuAction: () => {},
                    onOpenFilePath: () => {},
                    rendererReady: () => {},
                    getAppVersion: async () => "1.6.1", // Current version
                    getAppDataPath: async () => "",
                    listFiles: async () => []
                };
            """)

            page.reload()
            page.wait_for_load_state("networkidle")

            # Now "needsSetup" should be false.
            # And since version matches (1.6.1), it might NOT show What's New automatically.
            # So we need to trigger it manually.

            # Let's try to trigger it via the window.triggerSetupDialog but that sets setupMode=true.
            # We want setupMode=false.

            # We can look for the "What's New" button in the UI.
            # It's likely in the top bar.

            # If we can't find it, we can force the dialog to appear by mocking version mismatch.
            # If we report a NEWER version in package.json vs settings, it opens.

            # Let's try to change the version in the mock to something newer than what is in settings (likely undefined or old).
            # Actually, if we just want to see it, we can look for a button with a "Gift" icon or "What's New" text.
            # Or use a keyboard shortcut?

            # Let's try to find the button.
            # page.locator("button ...")

            # Taking a screenshot of the main UI to find the button
            page.screenshot(path="verification/main_ui.png")

            # Try to find a button that looks like it opens what's new.
            # Commonly it's a gift icon or info icon.
            # Let's try clicking the "Help" or similar if it exists.

            # Also, we can try to find the Svelte component instance and set the state, but that's hard.

            # Let's try to trigger via dispatching a custom event if the app listens to one? No.

            # Wait! The previous grep showed:
            # (window as any).triggerSetupDialog = ...
            # Maybe we can add a similar trigger for just WhatsNew?
            # No, I can't modify source code just for verification if I don't have to.

            # Let's try to mock the version to be different so it auto-opens.
            # The app checks: if (lastSeen !== currentVersion) showWhatsNew = true;
            # lastSeen comes from settingsStore (localStorage).
            # If we clear localStorage, lastSeen is likely undefined.
            # currentVersion is "1.6.1".
            # So it SHOULD open automatically if it's the first time running (no localStorage).

            # BUT, we also need to pass the "needsSetup" check.
            # So with our mock API returning a directory, and a fresh profile (cleared storage), it should open What's New.

            # Let's verify if the dialog appears.

            # Wait for text "What's New!"
            try:
                page.wait_for_selector("text=Autosave is Here!", timeout=5000)
                print("Found Autosave text!")
            except:
                print("Did not find text automatically. Trying to find button.")
                # Maybe we need to click something.
                # Let's look at the main_ui.png later if this fails.

            page.screenshot(path="verification/whats_new_verified.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/verification_failed.png")

        browser.close()

if __name__ == "__main__":
    verify_whats_new()
