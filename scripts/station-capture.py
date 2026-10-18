"""Capture clean final pages; check mobile logout and keyboard clipboard fallback.

Only edits unsaved form fields. Does not publish or modify content.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://localhost:3010')
parser.add_argument('--channel', default='msedge')
parser.add_argument('--credentials', type=Path, default=root / 'runtime' / 'station-admin.json')
args = parser.parse_args()
base = args.base_url.rstrip('/')
output = root / 'artifacts' / 'station'
output.mkdir(parents=True, exist_ok=True)
with sync_playwright() as p:
    browser = p.chromium.launch(channel=args.channel, headless=True)
    context = browser.new_context(base_url=base, locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    page = context.new_page()
    data = context.request.get(base + '/api/v1/station/data').json()
    software = next(s for s in data['software'] if len(s['platforms']) > 1)
    for width, height in [(390, 844), (1440, 1000), (360, 800)]:
        page.set_viewport_size({'width': width, 'height': height})
        for route, filename in [('/', 'home'), ('/software/' + software['slug'] + '?platform=android', 'software')]:
            page.goto(base + route, wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            page.screenshot(path=str(output / f'{filename}-{width}.png'), full_page=True)
            page.screenshot(path=str(output / f'{filename}-{width}-viewport.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText: async () => {throw new Error('denied')}}})")
    trigger = page.get_by_role('button', name='复制本页链接', exact=True).first
    trigger.click()
    expect(page.get_by_label('要复制的内容')).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(page.get_by_role('button', name='我知道了')).to_be_focused()
    page.keyboard.press('Tab')
    expect(page.get_by_label('要复制的内容')).to_be_focused()
    page.keyboard.press('Escape')
    expect(trigger).to_be_focused()
    assert page.evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches')
    credentials = json.loads(args.credentials.read_text(encoding='utf-8-sig'))
    page.goto(base + '/admin/login', wait_until='networkidle')
    page.get_by_label('邮箱', exact=True).fill(credentials['email'])
    page.locator('input[name="password"]').fill(credentials['password'])
    page.get_by_role('button', name='登录管理后台').click()
    page.wait_for_url('**/admin')
    page.wait_for_load_state('networkidle')
    logout = page.get_by_role('button', name='退出登录', exact=True)
    expect(logout).to_be_visible()
    rect = logout.bounding_box()
    assert rect and rect['width'] >= 44 and rect['height'] >= 44, rect
    for width, height in [(390, 844), (1440, 1000), (360, 800)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto(base + '/admin/station/releases/new?software=' + software['id'], wait_until='networkidle')
        page.get_by_label('版本号', exact=True).fill('3.3.0')
        page.get_by_label('一句话更新摘要', exact=False).fill('修复切换画质后偶尔卡顿的问题。')
        page.get_by_label('详细更新说明', exact=False).fill('改善播放稳定性，切换画质更流畅。\n保留收藏和观看记录，无需重新设置。')
        page.locator('h1').click()
        page.evaluate('window.scrollTo(0, 0)')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(output / f'admin-release-{width}.png'), full_page=True)
        page.screenshot(path=str(output / f'admin-release-{width}-viewport.png'))
    page.set_viewport_size({'width': 390, 'height': 844})
    page.get_by_role('button', name='退出登录', exact=True).click()
    page.wait_for_url('**/admin/login')
    assert context.request.get(base + '/api/v1/admin/station/data').status == 401
    (output / 'additional-ui-result.json').write_text(json.dumps({'status': 'passed', 'clipboard_focus_trap_and_restore': True, 'reduced_motion_mode': True, 'mobile_logout_visible_44px': True, 'logout_invalidates_session': True, 'clean_screenshots': 18}, indent=2), encoding='utf-8')
    browser.close()
print('PASS: keyboard copy dialog focus trap and return focus, mobile 44px logout, session invalidation; captured 18 clean page screenshots.')
