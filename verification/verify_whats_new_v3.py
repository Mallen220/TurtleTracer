
from playwright.sync_api import sync_playwright
import json

def verify_whats_new():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        try:
            page.goto("http://localhost:5173")

            # Inject mock electronAPI to bypass setup dialog AND trigger What's New
            init_script = """
                window.electronAPI = {
                    getSavedDirectory: async () => "/mock/path/AutoPaths",
                    getDirectory: async () => "/mock/path/AutoPaths",
                    setDirectory: async () => "/mock/path",
                    onMenuAction: () => {},
                    onOpenFilePath: () => {},
                    rendererReady: () => {},
                    getAppVersion: async () => "9.9.9",
                    getAppDataPath: async () => "",
                    listFiles: async () => []
                };
                localStorage.setItem("pedro-pathing-settings", JSON.stringify({lastSeenVersion: "1.0.0"}));
            """
            page.add_init_script(init_script)

            page.reload()
            page.wait_for_load_state("networkidle")

            # Now it should be open in "What's New" mode (not setup).
            # Wait for the dialog title
            page.wait_for_selector("text=What's New / Docs", timeout=5000)
            print("Dialog open in normal mode.")

            # Now we need to click "Latest Highlights"
            # It might be an H3 or just text inside a button
            page.get_by_text("Latest Highlights").click()

            # Now we should see our content "Autosave is Here!"
            page.wait_for_selector("text=Autosave is Here!", timeout=5000)
            print("Found Autosave text!")

            # Take screenshot
            page.screenshot(path="verification/verification_success.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/verification_failed_v3.png")

        browser.close()

if __name__ == "__main__":
    verify_whats_new()
