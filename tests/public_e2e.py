"""Run against an initialized, seeded local server. No remote sites are loaded."""
import json
import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
OUT.mkdir(exist_ok=True)
BASE = os.environ.get('E2E_BASE_URL', 'http://localhost:3000')
EDGE = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')


def run():
    checks = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **({'executable_path': str(EDGE)} if EDGE.exists() else {}))
        context = browser.new_context(viewport={'width': 1440, 'height': 1080}, device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(BASE)
        page.wait_for_load_state('networkidle')
        expect(page.get_by_role('heading', name='最新公告')).to_be_visible()
        assert page.locator('.announcement-card').count() >= 8
        for icon in page.locator('img').all():
            icon.scroll_into_view_if_needed()
            expect(icon).to_have_js_property('complete', True)
        assert page.locator('img').evaluate_all('(imgs) => imgs.every(i => i.complete && i.naturalWidth > 0)')
        page.evaluate('window.scrollTo(0, 0)')
        page.screenshot(path=str(OUT / 'home-desktop.png'), full_page=True)
        checks.append('announcement homepage SSR and local software icons')

        page.goto(BASE + '/software')

        page.get_by_role('searchbox').fill('VSCode')
        page.get_by_role('button', name='搜索软件', exact=True).click()
        page.wait_for_url('**/software?q=VSCode')
        expect(page.locator('.software-card')).to_have_count(1)
        expect(page.locator('.software-name')).to_have_text('VS Code')
        page.get_by_role('button', name='关注 Visual Studio Code', exact=True).click()
        expect(page.get_by_role('button', name='取消关注 Visual Studio Code')).to_have_attribute('aria-pressed', 'true')
        page.reload()
        expect(page.get_by_role('button', name='取消关注 Visual Studio Code')).to_have_attribute('aria-pressed', 'true')
        checks.append('alias search, follow and reload persistence')

        page.goto(BASE + '/my-software')
        expect(page.locator('.software-name')).to_have_text('VS Code')
        page.get_by_role('link', name='查看软件').click()
        expect(page.get_by_role('heading', name='Visual Studio Code', exact=True)).to_be_visible()
        expect(page.get_by_text('演示资料', exact=True)).to_be_visible()
        official = page.locator('.software-current-actions').get_by_role('link', name='前往官方网站', exact=True)
        expect(official).to_have_attribute('target', '_blank')
        expect(official).to_have_attribute('rel', 'noopener noreferrer')
        href = official.get_attribute('href')
        redirect = context.request.get(BASE + href, max_redirects=0)
        assert redirect.status == 302
        assert redirect.headers['location'] == 'https://code.visualstudio.com/'
        invalid = context.request.get(BASE + href + '?url=https://evil.example', max_redirects=0)
        assert invalid.status == 302 and invalid.headers['location'].startswith('/official-link-unavailable')
        assert context.request.get(BASE + '/api/v1' + href + '?url=https://evil.example', max_redirects=0).status == 400
        missing = context.request.get(BASE + '/go/not-a-real-link', max_redirects=0)
        assert missing.status == 302 and missing.headers['location'].startswith('/official-link-unavailable')
        assert context.request.get(BASE + '/api/v1/go/not-a-real-link', max_redirects=0).status == 404
        page.route('https://code.visualstudio.com/**', lambda route: route.fulfill(status=200, content_type='text/html', body='<h1>Official destination intercepted by test</h1>'))
        context.route('https://code.visualstudio.com/**', lambda route: route.fulfill(status=200, content_type='text/html', body='<h1>Official destination intercepted by test</h1>'))
        with page.expect_popup() as opened:
            official.click()
        popup = opened.value
        popup.wait_for_load_state()
        assert popup.url.startswith('https://code.visualstudio.com/')
        popup.close()
        page.screenshot(path=str(OUT / 'software-detail-desktop.png'), full_page=True)
        checks.append('software detail, demo notice, safe redirect and new tab')

        page.goto(BASE + '/software?q=' + '写代码')
        expect(page.locator('.software-name')).to_have_text('VS Code')
        page.goto(BASE + '/software?category=developer-tools&platform=linux')
        assert page.locator('.software-card').count() >= 4
        page.goto(BASE + '/software?q=unlikely-no-match-94733')
        expect(page.get_by_role('heading', name='暂时没有找到匹配的软件')).to_be_visible()
        page.get_by_role('link', name='查看全部软件').click()
        expect(page.locator('.software-card')).to_have_count(12)
        page.screenshot(path=str(OUT / 'software-library-desktop.png'), full_page=True)
        assert context.request.get(BASE + '/api/v1/software/does-not-exist').status == 404
        page.goto(BASE + '/software/does-not-exist')
        expect(page.get_by_role('heading', name='没有找到这个页面')).to_be_visible()
        # Next's streamed notFound response may be HTTP 200 after loading starts;
        # the framework must mark the rendered missing page as non-indexable.
        expect(page.locator('meta[name="robots"][content*="noindex"]').first).to_have_count(1)
        checks.append('purpose/category/platform filters, empty and 404 recovery')

        for width in [375, 393]:
            mobile = browser.new_context(viewport={'width': width, 'height': 812}, is_mobile=True, has_touch=True, device_scale_factor=1)
            mp = mobile.new_page()
            mp.on('pageerror', lambda error: errors.append(str(error)))
            mp.goto(BASE)
            mp.wait_for_load_state('networkidle')
            assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), f'home overflow {width}'
            mp.get_by_role('button', name='打开导航').click()
            expect(mp.get_by_role('navigation', name='手机导航')).to_be_visible()
            mp.get_by_role('navigation', name='手机导航').get_by_role('link', name='软件档案', exact=True).click()
            expect(mp.get_by_role('heading', name='找到你需要的工具')).to_be_visible()
            assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            mp.get_by_role('searchbox').fill('蓝色代码编辑器')
            mp.get_by_role('button', name='搜索软件', exact=True).click()
            expect(mp.locator('.software-card')).to_have_count(1)
            mp.get_by_role('link', name='查看软件').click()
            expect(mp.locator('.software-current-actions').get_by_role('link', name='前往官方网站', exact=True)).to_be_visible()
            assert mp.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
            if width == 375:
                mp.screenshot(path=str(OUT / 'software-detail-mobile-375.png'), full_page=True)
                mp.goto(BASE)
                mp.wait_for_load_state('networkidle')
                mp.screenshot(path=str(OUT / 'home-mobile-375.png'), full_page=True)
            mobile.close()
            checks.append(f'{width}px mobile menu/search/details/no overflow')
        assert not errors, errors
        checks.append('no uncaught browser JavaScript errors')
        browser.close()
    result = {'passed': len(checks), 'checks': checks, 'browser_errors': errors}
    (OUT / 'public-e2e-results.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    run()
