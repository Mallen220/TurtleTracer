from playwright.sync_api import sync_playwright

def verify_setup_dialog():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Inject mock electronAPI
        context.add_init_script("""
            window.electronAPI = {
                getSavedDirectory: async () => null, // Simulate no directory
                getDirectory: async () => null,
                setDirectory: async () => "/mock/path", // Mock selection
                onMenuAction: () => {},
                onOpenFilePath: () => {},
                rendererReady: () => {},
                getAppVersion: async () => "1.0.0",
                getAppDataPath: async () => "",
                listFiles: async () => []
            };
        """)

        page = context.new_page()
        page.goto("http://localhost:4173")

        # Wait for the dialog to appear
        # The dialog has "Select Your AutoPaths Directory" text
        try:
            page.wait_for_selector("text=Select Your AutoPaths Directory", timeout=10000)
            print("Setup dialog found!")
        except Exception as e:
            print(f"Setup dialog NOT found! {e}")
            page.screenshot(path="/home/jules/verification/verification_failure.png")
            browser.close()
            return

        # Take a screenshot
        page.screenshot(path="/home/jules/verification/verification.png")

        browser.close()

if __name__ == "__main__":
    verify_setup_dialog()
