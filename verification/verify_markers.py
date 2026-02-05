
from playwright.sync_api import sync_playwright

def run(playwright):
    browser = playwright.chromium.launch()
    page = browser.new_page()

    page.goto("http://localhost:4173")

    # Init settings to skip onboarding
    page.evaluate("localStorage.setItem('pedro-settings', JSON.stringify({hasSeenOnboarding: true, theme: 'light'}))")
    page.reload()
    page.wait_for_timeout(3000)

    # Try to close overlays
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)
    page.keyboard.press("Escape") # Twice for good measure (WhatsNew + Onboarding)
    page.wait_for_timeout(500)

    try:
        # Use exact match or title
        page.get_by_role("button", name="Add Path", exact=True).click(timeout=5000)
    except Exception as e:
        print(f"Failed to click Add Path: {e}")
        return

    page.wait_for_timeout(500)

    # Add Wait
    try:
        page.locator("button[title*='Add Wait command']").click(timeout=5000)
    except:
        page.get_by_role("button", name="Add Wait", exact=False).first.click()

    page.wait_for_timeout(500)

    # Switch to Field Tab
    page.click("#field-tab")
    page.wait_for_timeout(500)

    # Take screenshot of Field Tab
    page.screenshot(path="verification/verification.png")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
