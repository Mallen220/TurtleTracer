
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the generated HTML file
        file_path = os.path.abspath("verification/page_content.html")
        page.goto(f"file://{file_path}")

        # Take a screenshot
        screenshot_path = os.path.abspath("verification/simulation_page_preview.png")
        page.screenshot(path=screenshot_path, full_page=True)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    run()
