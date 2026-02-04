from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()

    page = context.new_page()
    page.goto("http://localhost:4173")
    page.evaluate("localStorage.setItem('hasSeenOnboarding', 'true')")
    page.reload()

    # Wait for loader to be hidden
    try:
        page.wait_for_selector("#loading-screen", state="hidden", timeout=15000)
    except:
        pass

    page.wait_for_selector("text=Path", timeout=10000)

    page.click("#settings-btn", force=True)
    page.wait_for_selector("text=Settings", timeout=5000)

    page.get_by_text("Code Export").click(force=True)
    page.locator("div").filter(has_text="Auto Export Code").locator("input[type=checkbox]").first.click(force=True)

    page.keyboard.press("Escape")

    page.wait_for_selector("#code-tab", timeout=5000)
    page.click("#code-tab", force=True)

    page.wait_for_timeout(2000)

    # Target the code container specifically
    code_container = page.locator(".font-mono.text-sm.overflow-auto")
    expect(code_container).to_be_visible()

    # Take screenshot
    page.screenshot(path="/home/jules/verification/code_tab_enabled.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
