from playwright.sync_api import sync_playwright, expect

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.set_viewport_size({"width": 1280, "height": 720})

    # Open the app
    page.goto("http://localhost:4173/")

    # Wait for app to load and loading screen to go away
    try:
        page.wait_for_selector("#loading-screen", state="detached", timeout=5000)
    except:
        pass # Maybe it was too fast

    page.wait_for_timeout(2000) # Wait for initial render and dialogs

    # Close What's New dialog if present (Press Escape)
    page.keyboard.press("Escape")
    page.wait_for_timeout(500)

    # Take screenshot before
    page.screenshot(path="verification_before.png")
    print("Screenshot before taken")

    # Toggle Presentation Mode (Alt+P)
    page.keyboard.press("Alt+p")

    # Wait for Navbar to disappear
    expect(page.locator(".flex-none.z-50")).to_be_hidden()

    page.wait_for_timeout(1000) # Wait for animation

    # Take screenshot in presentation mode
    page.screenshot(path="verification_presentation.png")
    print("Screenshot presentation taken")

    # Toggle back
    page.keyboard.press("Alt+p")

    # Wait for Navbar to reappear
    expect(page.locator(".flex-none.z-50")).to_be_visible()

    page.wait_for_timeout(1000) # Wait for animation

    page.screenshot(path="verification_after.png")
    print("Screenshot after taken")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
