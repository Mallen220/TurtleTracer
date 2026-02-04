from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    context = browser.new_context()

    # Bypass onboarding
    page = context.new_page()
    page.goto("http://localhost:4173")
    page.evaluate("localStorage.setItem('hasSeenOnboarding', 'true')")
    page.reload()

    # Wait for app to load
    page.wait_for_selector("text=Path")

    # Switch to Code tab
    # Assuming the tab button has text "Code" or "Export"
    # Looking at UI, typically "Code" icon/text.
    # I'll try to find the button by text.
    page.get_by_text("Code").click()

    # Wait for code to generate (it debounces 1s)
    page.wait_for_timeout(2000)

    # Check if code container is visible
    expect(page.locator(".font-mono")).to_be_visible()

    # Take screenshot
    page.screenshot(path="/home/jules/verification/code_tab.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
