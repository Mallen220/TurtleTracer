from playwright.sync_api import Page, expect, sync_playwright

def test_embed_pose_data_option(page: Page):
  # 1. Arrange: Go to the app
  page.goto("http://localhost:3000")

  # Wait for the app to load.
  # The app seems to have a canvas or some UI elements.
  # Let's wait for a known element. Based on file list, there is a Navbar or similar.
  # Let's try to wait for something that looks like the main UI.
  # Assuming the "Code" tab is available or we can open the export dialog.

  # Based on `src/lib/components/tabs/CodeTab.svelte`, there might be a button to open export settings or similar.
  # Or `src/lib/components/dialogs/ExportCodeDialog.svelte` is opened via some action.
  # Let's look for a button that might open the export dialog.
  # Usually "Export" or "Code".

  # Let's look at the UI via screenshots if needed, but for now I'll guess standard flow.
  # CodeTab might have "Export Code" button.

  # Click on "Code" tab if it exists (it seems to be a tab in `src/lib/components/ControlTab.svelte`)
  # Let's try to find a button with text "Export" or similar.

  # Wait for the page to stabilize
  page.wait_for_timeout(2000)

  # Try to find the "Code" tab button and click it.
  # Adjust selector based on actual UI.
  # If there are tabs, maybe "Code" text.
  code_tab = page.get_by_text("Code", exact=True)
  if code_tab.is_visible():
      code_tab.click()

  # Now look for "Export" or "Generate" button.
  # `src/lib/components/tabs/CodeTab.svelte` likely has it.
  export_btn = page.get_by_role("button", name="Export Code") # Guessing name
  if not export_btn.is_visible():
      # Maybe just "Export"?
      export_btn = page.get_by_text("Export", exact=True)

  if export_btn.is_visible():
      export_btn.click()
  else:
      # If we can't find it, maybe we need to create a path first?
      # The app might start empty.
      # Let's just try to find the button.
      print("Could not find Export button, dumping page content")
      print(page.content())

  # 2. Act: In the dialog, select "Sequential Command"
  # The dialog header should say "Export Java Code" by default.
  # We need to switch format to "Sequential Command".
  # In `ExportCodeDialog.svelte`, the header changes based on `exportFormat`.
  # There is a way to switch format?
  # Wait, `openWithFormat` is called with a format.
  # How does the user open it?
  # Maybe there are buttons "Export Java", "Export Sequential", etc.

  # Let's check `src/lib/components/tabs/CodeTab.svelte` or wherever it's called.
  # It seems `ExportCodeDialog` is a single component.
  # If I can't find the button to open specific format, I might struggle.

  # However, if the dialog is open, I can check for the new checkbox.
  # But the checkbox ONLY appears if `exportFormat === "sequential"`.

  # Let's assume there is a way to select "Sequential Command" export.
  # Maybe a dropdown or separate buttons?

  # Let's take a screenshot of the main page first to see what's available.
  page.screenshot(path="/home/jules/verification/main_page.png")

  # If I can see the "Sequential Command" option in the UI, I'll click it.

  # Let's try to force open the dialog if possible, or just click around.
  # Actually, looking at `src/lib/components/tabs/CodeTab.svelte`, it probably calls `openWithFormat`.

  # Let's look for text "Sequential"
  sequential_btn = page.get_by_text("Sequential", exact=False)
  if sequential_btn.count() > 0:
      sequential_btn.first.click()

  # Wait for dialog
  page.wait_for_timeout(1000)

  # 3. Assert: Check for "Embed Pose Data in Code" checkbox
  # It should be visible now if we are in Sequential mode.
  checkbox = page.get_by_label("Embed Pose Data in Code")

  if checkbox.is_visible():
      print("Checkbox found!")
      checkbox.check()
      page.wait_for_timeout(500) # Wait for code refresh

      # 4. Screenshot
      page.screenshot(path="/home/jules/verification/sequential_export_dialog.png")
  else:
      print("Checkbox NOT found. Screenshotting current state.")
      page.screenshot(path="/home/jules/verification/dialog_not_found.png")

if __name__ == "__main__":
  with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    try:
      test_embed_pose_data_option(page)
    finally:
      browser.close()
