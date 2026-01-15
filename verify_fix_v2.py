
from playwright.sync_api import sync_playwright, expect
import time

def run(playwright):
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto("http://localhost:4173/")

    # Wait for the app to load
    expect(page.get_by_role("heading", name="Pedro Pathing Visualizer").first).to_be_visible()

    # Handle What's New
    time.sleep(1)
    try:
        whats_new = page.locator("div[aria-labelledby='whats-new-title']")
        if whats_new.is_visible():
            print("Found What's New dialog, closing it...")
            page.keyboard.press("Escape")
            expect(whats_new).not_to_be_visible()
            print("Closed What's New dialog")
    except Exception as e:
        print(f"Error handling dialog: {e}")

    # Ensure loading screen is gone
    loading_screen = page.locator("#loading-screen")
    if loading_screen.is_visible():
        print("Waiting for loading screen to disappear...")
        expect(loading_screen).not_to_be_visible(timeout=10000)

    # Open Settings
    print("Opening Settings...")
    page.get_by_role("button", name="Settings").click()
    expect(page.get_by_role("dialog", name="Settings")).to_be_visible()

    # Expand Motion Parameters
    print("Expanding Motion Parameters...")
    motion_btn = page.get_by_text("Motion Parameters")
    motion_btn.click()

    # 1. Verify Unit Toggle Switch
    # Find the toggle buttons
    rad_btn = page.get_by_role("button", name="π rad/s")
    deg_btn = page.get_by_role("button", name="deg/s")
    expect(rad_btn).to_be_visible()
    expect(deg_btn).to_be_visible()

    print("Verifying Unit Toggle...")
    # Default is rad/s. Input value should be around 1 (PI rad/s input as multiplier)
    ang_vel_input = page.locator("#angular-velocity")
    initial_val = float(ang_vel_input.input_value())
    print(f"Initial Value (Rad Multiplier): {initial_val}") # Should be 1.0

    # Click deg/s
    deg_btn.click()
    # Value should convert to degrees (1.0 * 180 = 180)
    deg_val = float(ang_vel_input.input_value())
    print(f"Value in Deg/s: {deg_val}")

    if abs(deg_val - 180.0) > 0.1:
        print(f"FAIL: Unit conversion incorrect. Expected ~180, got {deg_val}")
        exit(1)

    # 2. Verify Max Angular Acceleration Input
    print("Verifying Max Angular Acceleration Input...")
    max_ang_acc_input = page.locator("#max-angular-acceleration")
    expect(max_ang_acc_input).to_be_visible()

    # Change it to 10
    max_ang_acc_input.fill("10")
    max_ang_acc_input.press("Enter")

    # Close Settings
    print("Closing Settings...")
    page.get_by_role("button", name="Close", exact=True).click()
    expect(page.get_by_role("dialog", name="Settings")).not_to_be_visible()

    # Take screenshot of new settings
    page.screenshot(path="/home/jules/verification/verification_v2.png")

    print("PASS: Verified Unit Toggle and New Input")

    browser.close()

with sync_playwright() as playwright:
    run(playwright)
