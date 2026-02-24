from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720})
        page = context.new_page()

        try:
            # Mock electronAPI
            page.add_init_script("""
                window.electronAPI = {
                    getDirectory: () => Promise.resolve('/mock/dir'),
                    getSavedDirectory: () => Promise.resolve('/mock/dir'),
                    setDirectory: () => Promise.resolve('/mock/dir'),
                    listFiles: () => Promise.resolve([
                        { name: 'current.pp', path: '/mock/dir/current.pp', size: 1024, modified: new Date().toISOString() },
                        { name: 'target.pp', path: '/mock/dir/target.pp', size: 2048, modified: new Date().toISOString() }
                    ]),
                    readFile: (path) => {
                        console.log("Reading file:", path);
                        if (path.endsWith('target.pp')) {
                            return Promise.resolve(JSON.stringify({
                                startPoint: {x:0,y:0},
                                lines: [
                                    {id:'l1', endPoint:{x:10,y:10}, controlPoints:[], name:'Added Line'}
                                ],
                                sequence: [],
                                shapes: []
                            }));
                        }
                        return Promise.resolve(JSON.stringify({
                            startPoint: {x:0,y:0},
                            lines: [],
                            sequence: [],
                            shapes: []
                        }));
                    },
                    writeFile: () => Promise.resolve(true),
                    deleteFile: () => Promise.resolve(true),
                    fileExists: () => Promise.resolve(true),
                    renameFile: () => Promise.resolve({success: true}),
                    createDirectory: () => Promise.resolve(true),
                    getDirectoryStats: () => Promise.resolve({})
                };
            """)

            page.goto("http://localhost:4173")
            page.wait_for_load_state("networkidle")

            # Open File Manager
            print("Opening File Manager...")
            page.locator("#file-manager-btn").click()

            page.wait_for_timeout(1000)

            # Right click on 'target.pp' with force=True
            print("Right clicking target.pp...")
            page.get_by_text("target").first.click(button="right", force=True)

            page.wait_for_timeout(500)

            # Click "Compare with Current"
            print("Clicking Compare...")
            if page.get_by_text("Compare with Current").is_visible():
                print("Context menu visible, clicking compare...")
                page.get_by_text("Compare with Current").click()

                page.wait_for_timeout(2000)

                if page.get_by_text("Diff View").is_visible():
                    print("Diff View is visible!")
                else:
                    print("Diff View NOT found!")
            else:
                print("Context menu NOT visible!")

            page.screenshot(path="verification/verification.png")

        except Exception as e:
            print(f"Error: {e}")
            page.screenshot(path="verification/error.png")

        finally:
            browser.close()

if __name__ == "__main__":
    run()
