"""Read-only browser reconnaissance before running station_e2e.py."""
import argparse
from pathlib import Path
from playwright.sync_api import sync_playwright

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://localhost:3010')
parser.add_argument('--channel', default='msedge')
args = parser.parse_args()
with sync_playwright() as p:
    browser = p.chromium.launch(channel=args.channel, headless=True)
    page = browser.new_page(viewport={'width': 390, 'height': 844}, locale='zh-CN')
    page.goto(args.url, wait_until='networkidle', timeout=120000)
    print('TITLE:', page.title())
    print('HEADINGS:', page.locator('h1,h2').all_text_contents())
    print('INPUTS:', page.locator('input,select,textarea').evaluate_all('(els) => els.map(e => ({name:e.name, label:e.getAttribute("aria-label"), placeholder:e.placeholder}))'))
    print('BUTTONS:', page.get_by_role('button').all_text_contents())
    print('BODY:', page.locator('body').inner_text()[:2500])
    output = Path(__file__).resolve().parents[1] / 'artifacts' / 'station'
    output.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(output / 'recon-live.png'), full_page=True)
    browser.close()
