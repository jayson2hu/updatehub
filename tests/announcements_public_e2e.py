"""Announcement-first browser acceptance against the seeded local service."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts'
BASE = os.getenv('E2E_BASE_URL', 'http://localhost:3000')
EDGE = Path(r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe')


def run():
    checks, errors = [], []
    OUT.mkdir(exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, **({'executable_path': str(EDGE)} if EDGE.exists() else {}))
        context = browser.new_context(viewport={'width':1440,'height':1000}, locale='zh-CN', timezone_id='Asia/Shanghai', permissions=['clipboard-read','clipboard-write'])
        page = context.new_page()
        page.on('pageerror', lambda error: errors.append(str(error)))

        def go(url):
            response = page.goto(BASE + url)
            page.wait_for_load_state('networkidle')
            return response

        go('/')
        expect(page.get_by_role('heading',name='最新公告')).to_be_visible()
        assert page.locator('.announcement-card').count() >= 8
        expect(page.locator('.announcement-card').first).to_have_class('announcement-card announcement-pinned')
        assert page.locator('.software-grid').count() == 0
        expect(page.locator('.announcement-action').first).to_be_visible()
        expect(page.get_by_role('searchbox',name='搜索公告或软件')).to_be_visible()
        page.screenshot(path=str(OUT/'announcements-home-desktop.png'),full_page=True)
        checks.append('homepage is announcements-first with pinned notices, action summaries and no software storefront')

        page.get_by_role('searchbox',name='搜索公告或软件').fill('VSCode')
        page.get_by_role('button',name='搜索公告',exact=True).click()
        expect(page.locator('.announcement-card').first).to_be_visible()
        assert page.locator('.announcement-source').all_text_contents() == ['VS Code'] * page.locator('.announcement-card').count()
        go('/updates')
        page.get_by_role('navigation',name='公告类型').get_by_role('link',name='维护通知',exact=True).click()
        expect(page.locator('.announcement-tabs a.selected')).to_have_text('维护通知')
        expect(page.locator('.announcement-card:not([data-kind="maintenance"])')).to_have_count(0)
        expect(page.locator('.announcement-card').first).to_be_visible()
        assert all(v == 'maintenance' for v in page.locator('.announcement-card').evaluate_all('(items)=>items.map(i=>i.dataset.kind)'))
        go('/updates')
        page.locator('summary').filter(has_text='筛选软件与建议').click()
        page.get_by_label('公告重要程度').select_option('hold')
        page.get_by_role('button',name='筛选',exact=True).click()
        expect(page.locator('.announcement-card').first).to_be_visible()
        assert all('暂缓' in t for t in page.locator('.announcement-card .status-badge').all_text_contents())
        checks.append('announcement search matches software aliases; kind and recommendation filters work')

        go('/updates?q=does-not-exist-772619')
        expect(page.get_by_role('heading',name='没有找到匹配的公告')).to_be_visible()
        page.get_by_role('link',name='查看全部公告',exact=True).click()
        expect(page.locator('.announcement-card').first).to_be_visible()
        checks.append('empty search provides a working return to all announcements')

        update = context.request.get(BASE+'/api/v1/updates/demo-vscode-release').json()
        go('/update/'+update['slug'])
        expect(page.get_by_role('heading',name=update['title'],exact=True)).to_be_visible()
        expect(page.get_by_role('heading',name='你需要做什么',exact=True)).to_be_visible()
        expect(page.get_by_role('heading',name='影响范围',exact=True)).to_be_visible()
        expect(page.get_by_text('演示公告，请勿作为实际操作依据',exact=True)).to_be_visible()
        source = page.get_by_role('link',name='查看官方 Release',exact=True).first
        expect(source).to_have_attribute('target','_blank')
        expect(source).to_have_attribute('rel','noopener noreferrer')
        page.get_by_role('button',name='复制公告链接',exact=True).click()
        expect(page.get_by_role('status')).to_have_text('链接已复制')
        assert page.evaluate('navigator.clipboard.readText()') == BASE+'/update/'+update['slug']
        page.get_by_role('button',name='关注 Visual Studio Code',exact=True).click()
        expect(page.get_by_role('button',name='取消关注 Visual Studio Code',exact=True)).to_have_attribute('aria-pressed','true')
        page.screenshot(path=str(OUT/'announcement-detail-desktop.png'),full_page=True)
        checks.append('detail prioritizes impact/action, labels demonstrations and copies the actual permalink')

        go('/my-software')
        expect(page.get_by_role('heading',name='我的关注',exact=True)).to_be_visible()
        expect(page.locator('.announcement-card').first).to_be_visible()
        assert all(s == update['software_id'] for s in page.locator('.announcement-card').evaluate_all('(items)=>items.map(i=>i.dataset.software)'))
        page.reload()
        expect(page.locator('.announcement-card').first).to_be_visible()
        page.screenshot(path=str(OUT/'announcements-followed-desktop.png'),full_page=True)
        go('/software/vscode')
        expect(page.get_by_role('heading',name='相关公告',exact=True)).to_be_visible()
        expect(page.locator('.software-announcements').get_by_role('link',name=update['title'],exact=False).first).to_be_visible()
        checks.append('followed announcements persist and software records link back to their notices')

        go('/update/announcement-does-not-exist')
        expect(page.get_by_role('heading',name='没有找到这个页面')).to_be_visible()
        expect(page.locator('meta[name="robots"][content*="noindex"]').first).to_have_count(1)
        assert context.request.get(BASE+'/api/v1/updates/announcement-does-not-exist').status == 404
        checks.append('missing announcements return API404 with a non-indexable recovery page')

        for width in (375,393):
            mobile = browser.new_context(viewport={'width':width,'height':812},is_mobile=True,has_touch=True,locale='zh-CN',timezone_id='Asia/Shanghai')
            mp=mobile.new_page()
            mp.on('pageerror',lambda error: errors.append(str(error)))
            mp.goto(BASE)
            mp.wait_for_load_state('networkidle')
            assert mp.evaluate('document.documentElement.scrollWidth <= innerWidth')
            expect(mp.get_by_role('heading',name='最新公告')).to_be_visible()
            if width == 375:
                mp.screenshot(path=str(OUT/'announcements-home-mobile-375.png'),full_page=True)
            mp.get_by_role('button',name='打开导航').click()
            mp.get_by_role('navigation',name='手机导航').get_by_role('link',name='最新公告',exact=True).click()
            mp.get_by_role('searchbox',name='搜索公告或软件').fill('VSCode')
            mp.get_by_role('button',name='搜索公告',exact=True).click()
            expect(mp.locator('.announcement-card').first).to_be_visible()
            mp.locator('.read-announcement').first.click()
            expect(mp.get_by_role('heading',name='你需要做什么',exact=True)).to_be_visible()
            assert mp.evaluate('document.documentElement.scrollWidth <= innerWidth')
            if width == 375:
                mp.screenshot(path=str(OUT/'announcement-detail-mobile-375.png'),full_page=True)
            mobile.close()
            checks.append(f'{width}px mobile navigation/search/reading without overflow')
        assert not errors, errors
        checks.append('no uncaught browser errors')
        browser.close()
    result={'passed':len(checks),'checks':checks,'browser_errors':errors}
    (OUT/'announcements-public-e2e.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps(result,ensure_ascii=False))


if __name__ == '__main__':
    run()
