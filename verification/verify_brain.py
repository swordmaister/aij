import os
from playwright.sync_api import sync_playwright

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Get absolute path to index.html
        file_path = os.path.abspath('index.html')
        page.goto(f'file://{file_path}')

        # Wait for the scene to load (check for the viewport)
        page.wait_for_selector('#viewport')

        # Check if the initial nodes are created (the code has a setTimeout of 300ms)
        page.wait_for_timeout(1000)

        # Take a screenshot
        screenshot_path = 'verification/brain_space.png'
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == '__main__':
    run()
