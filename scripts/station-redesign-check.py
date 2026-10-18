"""Read-only browser checks and screenshots for the station visual redesign.

The admin form is only filled and previewed. No content is saved or published.
"""
import argparse
import json
from datetime import datetime, timezone
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://localhost:3010')
parser.add_argument('--channel', default='msedge')
parser.add_argument('--credentials', type=Path, default=root / 'runtime/station-admin.json')
args = parser.parse_args()
base = args.base_url.rstrip('/')
output = root / 'artifacts/redesign-20261013'
output.mkdir(parents=True, exist_ok=True)
results = []
errors = []


def mark(name, **detail):
    results.append({'check': name, 'passed': True, **detail})


def expired(notice):
    return bool(notice['expires_at'] and datetime.fromisoformat(
        notice['expires_at'].replace('Z', '+00:00')).timestamp() <= datetime.now(timezone.utc).timestamp())


with sync_playwright() as p:
    browser = p.chromium.launch(channel=args.channel, headless=True)
    context = browser.new_context(base_url=base, locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    data = context.request.get('/api/v1/station/data').json()
    software = next(s for s in data['software'] if len(s['platforms']) > 1 and s['aliases'])
    assert not data['settings']['ads_enabled']
    assert context.request.get('/api/v1/admin/station/data').status == 401
    mark('visitor_admin_access_denied_and_ads_collapsed')

    page.set_viewport_size({'width': 390, 'height': 844})
    page.goto('/', wait_until='networkidle')
    search = page.get_by_label('搜索软件名称或别名')
    search.fill(software['aliases'][0])
    expect(page.locator('.st-update-title h3').first).to_have_text(software['name'])
    assert all(name == software['name'] for name in page.locator('.st-update-title h3').all_text_contents())
    page.get_by_role('button', name='清除搜索', exact=True).click()
    page.get_by_role('button', name='电视', exact=True).click()
    assert all('电视' in text for text in page.locator('.st-update-meta .st-device-tag').all_text_contents())
    search.fill('这个名称不存在-visual-check')
    expect(page.get_by_role('heading', name='没有找到对应的更新')).to_be_visible()
    page.get_by_role('button', name='清除搜索和筛选').click()
    expect(page.get_by_role('button', name='全部', exact=True)).to_have_attribute('aria-pressed', 'true')
    expect(search).to_have_value('')
    mark('alias_search_device_filter_empty_state_and_reset')

    page.get_by_role('button', name='电视', exact=True).click()
    target = page.locator('.st-update-row').first
    expected_route = target.get_attribute('href')
    target.click()
    page.wait_for_url('**' + expected_route)
    page.wait_for_load_state('networkidle')
    assert page.url.endswith(expected_route)
    expect(page.get_by_role('button', name='安卓电视', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.reload(wait_until='networkidle')
    expect(page.get_by_role('button', name='安卓电视', exact=True)).to_have_attribute('aria-pressed', 'true')
    mark('update_deep_link_and_reload_preserve_selected_device')

    page.goto('/software/' + software['slug'] + '?platform=android', wait_until='networkidle')
    platform_names = {'android': '安卓手机', 'ios': '苹果手机', 'tv': '安卓电视', 'desktop': '电脑'}
    for platform in software['platforms']:
        selected = page.get_by_role('button', name=platform_names[platform], exact=True)
        selected.click()
        latest = sorted([r for r in data['releases'] if r['software_id'] == software['id'] and r['platform'] == platform], key=lambda r: r['published_at'] or '', reverse=True)[0]
        expect(page.locator('.st-version-head > strong')).to_have_text('v' + latest['version'].lstrip('vV'))
        expect(page.locator('.st-fixed-get > div')).to_contain_text(platform_names[platform])
        expect(selected).to_have_attribute('aria-pressed', 'true')
        assert 'platform=' + platform in page.url
        if not latest['links']:
            expect(page.locator('.st-unavailable')).to_be_visible()
            assert page.locator('.st-download-actions a').count() == 0
    assert page.locator('.st-history > details').get_attribute('open') is None
    mark('platform_versions_unconfigured_links_fixed_bar_and_collapsed_history')

    page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async value => {window.__copied = value}}})")
    trigger = page.get_by_role('button', name='复制本页链接', exact=True).first
    trigger.click()
    expect(page.get_by_role('button', name='已复制', exact=True).first).to_be_visible()
    assert page.evaluate('window.__copied') == page.url
    page.wait_for_timeout(2600)
    page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {writeText: async () => {throw new Error('denied')}}})")
    trigger.click()
    expect(page.get_by_label('要复制的内容')).to_be_focused()
    page.keyboard.press('Shift+Tab')
    expect(page.get_by_role('button', name='我知道了')).to_be_focused()
    page.keyboard.press('Tab')
    expect(page.get_by_label('要复制的内容')).to_be_focused()
    page.keyboard.press('Escape')
    expect(trigger).to_be_focused()
    mark('copy_success_and_denied_fallback_keyboard_focus')

    page.goto('/software', wait_until='networkidle')
    page.get_by_role('button', name='电视', exact=True).click()
    assert all('?platform=tv' in href for href in page.locator('.st-software-card').evaluate_all('elements => elements.map(element => element.getAttribute("href"))'))
    expect(page.locator('.st-software-card').first).to_be_visible()
    mark('directory_filter_preserves_device_in_destination')

    ended = next(n for n in data['announcements'] if expired(n))
    page.goto('/announcements/' + ended['slug'], wait_until='networkidle')
    expect(page.get_by_role('heading', name=ended['title'], exact=True)).to_be_visible()
    expect(page.locator('.st-expired-notice')).to_contain_text('已结束')
    page.reload(wait_until='networkidle')
    expect(page.locator('.st-expired-notice')).to_be_visible()
    page.goto('/software/visual-check-missing', wait_until='networkidle')
    expect(page.get_by_role('heading', name='这个页面找不到了')).to_be_visible()
    expect(page.get_by_role('link', name='前往软件目录')).to_be_visible()
    mark('announcement_direct_link_expiry_and_missing_page_recovery')

    routes = [('/', 'home'), ('/software', 'directory'), ('/software/' + software['slug'] + '?platform=android', 'detail'), ('/announcements', 'announcements'), ('/announcements/' + ended['slug'], 'announcement-ended')]
    for width, height in [(1440, 1000), (390, 844), (360, 800)]:
        page.set_viewport_size({'width': width, 'height': height})
        for route, name in routes:
            page.goto(route, wait_until='networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            assert page.locator('.st-ad-slot').count() == 0
            if name == 'home' and width < 700:
                row = page.locator('.st-update-row').first.bounding_box()
                nav = page.locator('.st-bottom-nav').bounding_box()
                assert row['y'] + row['height'] <= nav['y'], (row, nav)
                expect(page.locator('.st-pinned-wrap')).to_be_visible()
            if name == 'detail' and width < 700:
                bar = page.locator('.st-fixed-get').bounding_box()
                nav = page.locator('.st-bottom-nav').bounding_box()
                assert abs(bar['y'] + bar['height'] - nav['y']) <= 1
                page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                last = page.locator('.st-history').bounding_box()
                assert last['y'] + last['height'] < bar['y']
                page.evaluate('window.scrollTo(0, 0)')
                for button in page.locator('.st-platform-tabs button, .st-software-heading > .st-copy').all():
                    box = button.bounding_box()
                    assert box['width'] >= 44 and box['height'] >= 44, box
            page.screenshot(path=str(output / f'{name}-{width}.png'))
            page.screenshot(path=str(output / f'{name}-{width}-full.png'), full_page=True)
        mark('responsive_visual_check', width=width, height=height, pages=len(routes))

    credentials = json.loads(args.credentials.read_text(encoding='utf-8-sig'))
    page.goto('/admin/login', wait_until='networkidle')
    page.get_by_label('邮箱', exact=True).fill(credentials['email'])
    page.locator('input[name="password"]').fill(credentials['password'])
    page.get_by_role('button', name='登录管理后台').click()
    page.wait_for_url('**/admin')
    for width, height in [(1440, 1000), (390, 844), (360, 800)]:
        page.set_viewport_size({'width': width, 'height': height})
        page.goto('/admin/station/releases/new?software=' + software['id'], wait_until='networkidle')
        page.get_by_label('版本号', exact=True).fill('3.3.0')
        page.get_by_label('一句话更新摘要', exact=False).fill('修复切换画质后偶尔卡顿的问题。')
        page.get_by_label('详细更新说明', exact=False).fill('改善播放稳定性，切换画质更流畅。\n保留收藏和观看记录，无需重新设置。')
        page.get_by_role('heading', name='发布软件更新', exact=True).click()
        page.evaluate('window.scrollTo(0, 0)')
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
        page.screenshot(path=str(output / f'admin-release-{width}.png'))
        page.screenshot(path=str(output / f'admin-release-{width}-full.png'), full_page=True)
    page.get_by_role('button', name='预览', exact=True).click()
    expect(page.get_by_role('dialog')).to_be_visible()
    expect(page.get_by_role('dialog')).to_contain_text('修复切换画质后偶尔卡顿的问题。')
    page.keyboard.press('Escape')
    page.get_by_role('button', name='退出登录', exact=True).click()
    page.wait_for_url('**/admin/login')
    assert context.request.get('/api/v1/admin/station/data').status == 401
    mark('admin_unsaved_form_responsive_preview_and_logout')

    after = context.request.get('/api/v1/station/data').json()
    assert after == data
    assert not errors, errors
    mark('persistent_content_unchanged_and_no_browser_errors', software=len(data['software']), releases=len(data['releases']), announcements=len(data['announcements']))
    browser.close()

(output / 'verification.json').write_text(json.dumps({'status': 'passed', 'checks': results, 'page_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status': 'passed', 'checks': len(results), 'screenshots': 36, 'page_errors': errors}, ensure_ascii=False))
