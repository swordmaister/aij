from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        # WebGL needs GPU usually, or software fallback.
        # Playwright headless chromium might not render WebGL context correctly without --use-gl=egl
        browser = p.chromium.launch(headless=True, args=["--use-gl=egl"])

        page = browser.new_page()
        page.goto("http://localhost:8080/index.html")

        # Wait for canvas
        page.wait_for_selector("canvas", timeout=10000)

        # Wait for animation/physics to settle/animate
        time.sleep(3)

        # Screenshot
        page.screenshot(path="verification/screenshot.png")
        browser.close()

if __name__ == "__main__":
    run()
