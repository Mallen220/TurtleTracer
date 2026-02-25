from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()

    # Navigate to app
    page.goto("http://localhost:5173")

    # Inject mock electronAPI
    page.evaluate("""
        window.openFileHandlers = [];
        window.electronAPI = {
            gitShow: async () => JSON.stringify({ lines: [], sequence: [], startPoint: {x:0, y:0, heading: 'tangential', reverse: false}, settings: {} }),
            selectFile: async () => '/mock/path/reference.pp',
            readFile: async (path) => {
                if (path === '/mock/project.pp') {
                    return JSON.stringify({ lines: [{id:'1', endPoint:{x:10,y:10}, controlPoints:[], color:'red'}], sequence: [], startPoint: {x:0, y:0, heading: 'tangential', reverse: false}, settings: {} });
                }
                return JSON.stringify({ lines: [], sequence: [], startPoint: {x:0, y:0, heading: 'tangential', reverse: false}, settings: {} });
            },
            getSavedDirectory: async () => null,
            getDirectory: async () => null,
            listFiles: async () => [],
            isWindowsStore: async () => false,
            onOpenFilePath: (cb) => { window.openFileHandlers.push(cb); },
            onAppCloseRequested: () => {},
            onMenuAction: () => {},
            rendererReady: async () => {},
            onUpdateAvailable: () => {},
            resolvePath: async (b, r) => r,
        };
    """)

    # Trigger open file simulation
    page.wait_for_timeout(2000) # Wait for app load

    # Check if handlers registered
    handlers_count = page.evaluate("window.openFileHandlers.length")
    print(f"Handlers registered: {handlers_count}")

    if handlers_count == 0:
        # Maybe reload and inject faster? or use add_init_script
        print("Retrying with add_init_script...")
        page.close()
        page = browser.new_page()
        page.add_init_script("""
            window.openFileHandlers = [];
            window.electronAPI = {
                gitShow: async () => JSON.stringify({ lines: [], sequence: [], startPoint: {x:0, y:0, heading: 'tangential', reverse: false}, settings: {} }),
                selectFile: async () => '/mock/path/reference.pp',
                readFile: async (path) => {
                    if (path === '/mock/project.pp') {
                        return JSON.stringify({ lines: [{id:'1', endPoint:{x:10,y:10}, controlPoints:[], color:'red'}], sequence: [], startPoint: {x:0, y:0, heading: 'tangential', reverse: false}, settings: {} });
                    }
                    return JSON.stringify({ lines: [], sequence: [], startPoint: {x:0, y:0, heading: 'tangential', reverse: false}, settings: {} });
                },
                getSavedDirectory: async () => null,
                getDirectory: async () => null,
                listFiles: async () => [],
                isWindowsStore: async () => false,
                onOpenFilePath: (cb) => { window.openFileHandlers.push(cb); },
                onAppCloseRequested: () => {},
                onMenuAction: () => {},
                rendererReady: async () => {},
                onUpdateAvailable: () => {},
                resolvePath: async (b, r) => r,
            };
        """)
        page.goto("http://localhost:5173")
        page.wait_for_timeout(2000)

    # Close What's New dialog if present
    try:
        page.evaluate("""
            const dialog = document.querySelector('[role="dialog"][aria-labelledby="whats-new-title"]');
            if (dialog) dialog.remove();

            // Also remove the backdrop if separate?
            // Usually removing the dialog root is enough if it wraps everything.
            // The log shows: <div role="dialog" ... class="fixed inset-0 z-[100] ..."> ... </div>
            // So removing this element should clear the overlay.
        """)
        page.wait_for_timeout(500)
    except:
        pass

    # Trigger open
    page.evaluate("""
        if (window.openFileHandlers.length > 0) {
            window.openFileHandlers.forEach(cb => cb('/mock/project.pp'));
        }
    """)

    page.wait_for_timeout(1000)

    # Modify to make dirty
    page.mouse.dblclick(400, 400)
    page.wait_for_timeout(1000)

    # Check for Diff button
    diff_btn = page.get_by_title("Compare with Saved")

    if diff_btn.count() > 0:
        print("Diff button found!")
        diff_btn.click()
        page.wait_for_timeout(500)

        # Verify UI
        expect(page.get_by_text("Git History")).to_be_visible()
        expect(page.get_by_text("File Comparison")).to_be_visible()

        # Switch to File Comparison
        page.get_by_text("File Comparison").click()

        try:
            expect(page.get_by_text("Change File")).to_be_visible()
            # expect(page.get_by_text("Analyzing file contents...")).to_be_visible()

            # Take screenshot
            page.screenshot(path="verification/diff_ui.png")
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification/failed_assertion.png")
            raise e
    else:
        print("Diff button not found.")
        page.screenshot(path="verification/failed_diff_ui.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
