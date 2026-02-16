from playwright.sync_api import sync_playwright, expect

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Navigate to app
        page.goto("http://localhost:5173")

        # Wait for app to load (checking for a known element)
        page.wait_for_selector("text=Pedro Pathing Plus Visualizer", timeout=10000)

        # Inject Mock API and trigger update
        page.evaluate("""
            window.electronAPI = {
                onUpdateAvailable: (callback) => {
                    window.triggerUpdate = callback;
                },
                isWindowsStore: async () => false,
                downloadUpdate: () => console.log("Download"),
                skipUpdate: () => console.log("Skip"),
                openExternal: () => console.log("Open External")
            };

            // Mock user agent to simulate Windows
            Object.defineProperty(navigator, 'userAgent', {
                get: function () { return 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'; }
            });
        """)

        # Reload page to apply onMount logic with mocked API?
        # No, onMount runs on load. If I inject after load, onMount might have already run.
        # I need to inject BEFORE load.

        # Retry with add_init_script

        browser.close()

def run_properly():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
        )
        page = context.new_page()

        # Mock electronAPI before page loads
        page.add_init_script("""
            window.electronAPI = {
                onUpdateAvailable: (callback) => {
                    window.triggerUpdate = callback;
                },
                isWindowsStore: async () => false,
                downloadUpdate: () => console.log("Download"),
                skipUpdate: () => console.log("Skip"),
                openExternal: () => console.log("Open External")
            };
        """)

        page.goto("http://localhost:5173")

        # Wait for app to initialize
        page.wait_for_timeout(2000)

        # Trigger update
        page.evaluate("""
            if (window.triggerUpdate) {
                window.triggerUpdate({
                    version: "2.0.0",
                    releaseNotes: "• Major performance improvements\\n• New feature: Potato Mode\\n• Bug fixes",
                    url: "https://github.com/example/repo/releases/tag/v2.0.0"
                });
            } else {
                console.error("triggerUpdate not set");
            }
        """)

        # Wait for dialog
        try:
            dialog = page.get_by_role("dialog", name="New Version Available")
            expect(dialog).to_be_visible(timeout=5000)
            print("Dialog visible")

            # Verify MS Store recommendation is present (title changed in redesign)
            expect(page.get_by_text("Want automatic updates?")).to_be_visible()
            print("Recommendation visible")

        except:
            print("Dialog not found or assertion failed, taking debug screenshot")
            page.screenshot(path="verification/debug.png")
            raise

        # Take screenshot
        page.screenshot(path="verification/update_dialog.png")
        print("Screenshot saved to verification/update_dialog.png")

        browser.close()

if __name__ == "__main__":
    run_properly()
