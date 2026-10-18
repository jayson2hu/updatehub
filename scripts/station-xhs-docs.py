"""Read public official documentation assets for the XHS platform adapter."""
import json
import re
import urllib.request
from pathlib import Path
import sys
sys.stdout.reconfigure(encoding='utf-8')

if '--browser' in sys.argv:
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        page = browser.new_page()
        page.goto('https://miniapp.xiaohongshu.com/doc/DC026595', wait_until='domcontentloaded')
        page.wait_for_timeout(5000)
        print(page.locator('body').inner_text()[:22000])
        print(page.locator('a[href]').evaluate_all('(links)=>links.map(a=>({text:a.innerText,href:a.href})).filter(x=>/文件|框架|API|分享|剪贴|目录|转换|兼容/.test(x.text))')[:60])
        for label in ['小程序代码构成','快速开始','配置小程序','JS API']:
            page.get_by_text(label, exact=True).first.click()
            page.wait_for_timeout(1500)
            print('\nDOCUMENT '+page.url+'\n'+page.locator('body').inner_text()[:26000])
        if '--apis' in sys.argv:
            for label in ['系统','界面','网络','转发','设备']:
                page.get_by_text(label, exact=True).first.click()
                page.wait_for_timeout(300)
                print('\nAPI GROUP '+label+'\n'+page.locator('body').inner_text()[:6500])
        browser.close()
    sys.exit(0)

opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
folder = Path(__file__).resolve().parents[1] / 'runtime' / 'xhs-docs'
folder.mkdir(parents=True, exist_ok=True)
url = 'https://miniapp.xiaohongshu.com/'
html = opener.open(url, timeout=15).read().decode('utf-8')
(folder / 'index.html').write_text(html, encoding='utf-8')
scripts = re.findall(r'<script[^>]+src="([^"]+)', html)
chosen = [s for s in scripts if '/index.' in s or '/5652.' in s or '/bundler-runtime.' in s]
for i, src in enumerate(chosen):
    (folder / f'asset{i}.js').write_bytes(opener.open(src, timeout=20).read())
print(json.dumps({'url': url, 'scripts': chosen}, ensure_ascii=False))
