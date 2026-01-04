from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_contact_section(page: Page):
    """
    Verifies that the 'Contact & Support' section has been added to the Settings dialog.
    """
    # 1. Arrange: Go to the app
    # Use localhost:4173 as the preview server is running there
    page.goto("http://localhost:4173/")

    # Force hide the loading screen because we are in a browser preview without Electron
    page.add_style_tag(content="#loading-screen { display: none !important; }")

    # 2. Act: Open Settings
    # Find the settings button by aria-label "Settings"
    # Wait for it to be visible first
    settings_btn = page.get_by_label("Settings")
    expect(settings_btn).to_be_visible(timeout=10000)
    settings_btn.click()

    # Wait for Settings dialog to open
    expect(page.get_by_role("dialog")).to_be_visible()

    # Find the "Credits & Legal" section button
    credits_btn = page.get_by_text("Credits & Legal")
    expect(credits_btn).to_be_visible()

    # Click to expand
    credits_btn.click()

    # 3. Assert: Check for "Contact & Support" section
    # Wait for the animation to reveal the content
    time.sleep(1)

    contact_header = page.get_by_role("heading", name="Contact & Support")
    expect(contact_header).to_be_visible()

    # Check for GitHub Issues link
    github_link = page.get_by_role("link", name="GitHub Issues")
    expect(github_link).to_be_visible()
    expect(github_link).to_have_attribute("href", "https://github.com/Mallen220/PedroPathingVisualizer/issues")

    # Check for Discord text
    discord_text = page.get_by_text("Discord: mallen20")
    expect(discord_text).to_be_visible()

    # Check for Email link
    email_link = page.get_by_role("link", name="allenmc220@gmail.com")
    expect(email_link).to_be_visible()
    expect(email_link).to_have_attribute("href", "mailto:allenmc220@gmail.com")

    # 4. Screenshot
    page.screenshot(path="verification_settings.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Set viewport to a desktop size to ensure layout is consistent
        page.set_viewport_size({"width": 1280, "height": 720})
        try:
            verify_contact_section(page)
            print("Verification successful!")
        except Exception as e:
            print(f"Verification failed: {e}")
            page.screenshot(path="verification_failure.png")
            raise e
        finally:
            browser.close()
