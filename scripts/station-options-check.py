"""Read-only checks for three complete design previews and their comparison page."""
import argparse
import json
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://localhost:3010')
parser.add_argument('--channel', default='msedge')
args = parser.parse_args()
output = root / 'artifacts/design-options'
output.mkdir(parents=True, exist_ok=True)
previews = root / 'apps/web/public/design-previews'
previews.mkdir(parents=True, exist_ok=True)
checks = []
errors = []


def record(name, **details):
    checks.append({'check': name, 'passed': True, **details})


with sync_playwright() as p:
    browser = p.chromium.launch(channel=args.channel, headless=True)
    context = browser.new_context(base_url=args.base_url, locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    page = context.new_page()
    page.on('pageerror', lambda error: errors.append(str(error)))
    before = context.request.get('/api/v1/station/data').json()
    software = next(s for s in before['software'] if s['slug'] == 'guangmu')
    ended = next(n for n in before['announcements'] if n.get('expired'))
    assert context.request.get('/api/v1/admin/station/data').status == 401

    for design in ['a', 'b', 'c']:
        prefix = '/designs/' + design
        page.set_viewport_size({'width': 390, 'height': 844})
        page.goto(prefix, wait_until='networkidle')
        expect(page.locator('.st-site')).to_have_class('st-site st-theme-' + design)
        assert page.locator('.st-bottom-nav a').first.get_attribute('href') == prefix
        search = page.get_by_label('搜索软件名称或别名')
        search.fill(software['aliases'][0])
        assert all(name == software['name'] for name in page.locator('.st-update-title h3').all_text_contents())
        page.get_by_role('button', name='清除搜索', exact=True).click()
        page.get_by_role('button', name='电视', exact=True).click()
        assert all('电视' in text for text in page.locator('.st-update-meta .st-device-tag').all_text_contents())
        search.fill('找不到的测试名称')
        expect(page.get_by_role('heading', name='没有找到对应的更新')).to_be_visible()
        page.get_by_role('button', name='清除搜索和筛选').click()
        target = page.locator('.st-update-row').first
        destination = target.get_attribute('href')
        assert destination.startswith(prefix + '/software/')
        target.click()
        page.wait_for_url('**' + destination)
        page.wait_for_load_state('networkidle')
        version = page.locator('.st-version-section').bounding_box()
        toolbar = page.locator('.dp-toolbar').bounding_box()
        assert version['y'] >= toolbar['y'] + toolbar['height'] - 1, (design, version, toolbar)
        page.reload(wait_until='networkidle')
        expect(page.get_by_role('heading', name=software['name'], exact=True)).to_be_visible()
        record('search_filter_empty_reset_prefixed_share_link_and_anchor', design=design)

        page.goto(prefix + '/software/' + software['slug'] + '?platform=android', wait_until='networkidle')
        for platform, label in [('android', '安卓手机'), ('tv', '安卓电视'), ('desktop', '电脑')]:
            page.get_by_role('button', name=label, exact=True).click()
            release = sorted([r for r in before['releases'] if r['software_id'] == software['id'] and r['platform'] == platform], key=lambda r: r['published_at'] or '', reverse=True)[0]
            expect(page.locator('.st-version-head > strong')).to_have_text('v' + release['version'].lstrip('vV'))
            expect(page.locator('.st-fixed-get > div')).to_contain_text(label)
            if not release['links']:
                assert page.locator('.st-download-actions a').count() == 0
                expect(page.locator('.st-unavailable')).to_be_visible()
        other = {'a': 'b', 'b': 'c', 'c': 'a'}[design]
        toolbar_link = page.locator(f'.dp-toolbar a.dp-option[href^="/designs/{other}"]')
        assert 'platform=desktop' in toolbar_link.get_attribute('href')
        toolbar_link.click()
        page.wait_for_url('**/designs/' + other + '/software/' + software['slug'] + '?platform=desktop')
        expect(page.get_by_role('button', name='电脑', exact=True)).to_have_attribute('aria-pressed', 'true')
        record('platform_versions_links_and_device_preserved_between_designs', design=design)

        page.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText:async()=>{throw new Error('denied')}}})")
        trigger = page.get_by_role('button', name='复制本页链接', exact=True).first
        trigger.click()
        expect(page.get_by_label('要复制的内容')).to_be_focused()
        page.keyboard.press('Shift+Tab')
        expect(page.get_by_role('button', name='我知道了')).to_be_focused()
        page.keyboard.press('Escape')
        expect(trigger).to_be_focused()
        record('clipboard_fallback_and_keyboard_focus_in_preview', design=design)

        routes = [('', 'home'), ('/software', 'directory'), ('/software/' + software['slug'] + '?platform=android', 'detail'), ('/announcements', 'announcements'), ('/announcements/' + ended['slug'], 'announcement-ended')]
        for width, height in [(1440, 1000), (390, 844), (360, 800)]:
            page.set_viewport_size({'width': width, 'height': height})
            for route, name in routes:
                page.goto(prefix + route, wait_until='networkidle')
                assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1'), (design, width, name)
                assert page.locator('.st-ad-slot').count() == 0
                if name == 'home' and width == 1440:
                    for shortcut in page.locator('.st-shortcut-grid > a').all():
                        href = shortcut.get_attribute('href')
                        slug = href.split('/software/')[1].split('?')[0]
                        item = next(s for s in before['software'] if s['slug'] == slug)
                        release = sorted([r for r in before['releases'] if r['software_id'] == item['id']], key=lambda r: r['published_at'] or '', reverse=True)[0]
                        assert href.endswith('?platform=' + release['platform'])
                        assert release['version'] in shortcut.locator('.st-shortcut-version').text_content()
                if name == 'home' and width < 700:
                    row = page.locator('.st-update-row').first.bounding_box()
                    nav = page.locator('.st-bottom-nav').bounding_box()
                    assert row['y'] + row['height'] < nav['y'], (design, width, row, nav)
                    expect(page.locator('.st-pinned-wrap')).to_be_visible()
                if name == 'detail' and width < 700:
                    bar = page.locator('.st-fixed-get').bounding_box()
                    nav = page.locator('.st-bottom-nav').bounding_box()
                    assert abs(bar['y'] + bar['height'] - nav['y']) <= 1
                    page.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                    last = page.locator('.st-history').bounding_box()
                    assert last['y'] + last['height'] < bar['y']
                    page.evaluate('window.scrollTo(0, 0)')
                if name == 'announcement-ended':
                    expect(page.locator('.st-expired-notice')).to_contain_text('已结束')
                for button in page.locator('.st-device-filters button, .st-platform-tabs button, .dp-option, .dp-overview').all():
                    box = button.bounding_box()
                    if box:
                        assert box['height'] >= 44 and box['width'] >= 44, box
                page.screenshot(path=str(output / f'{design}-{name}-{width}.png'))
                page.screenshot(path=str(output / f'{design}-{name}-{width}-full.png'), full_page=True)
                if name == 'home' and width != 360:
                    page.screenshot(path=str(previews / f'{design}-{"mobile" if width == 390 else "desktop"}.png'))
            record('five_pages_responsive_and_first_update_complete', design=design, width=width)
        print(f'PASS: design {design.upper()} interactions and three viewports', flush=True)

    page.goto('/designs', wait_until='networkidle')
    page.locator('.dg-card').nth(1).get_by_role('button', name='暂选这套', exact=True).click()
    expect(page.locator('.dg-choice')).to_contain_text('当前暂选 B')
    page.reload(wait_until='networkidle')
    expect(page.locator('.dg-choice')).to_contain_text('当前暂选 B')
    page.get_by_role('button', name='电脑效果', exact=True).click()
    assert all('-desktop.png' in src for src in page.locator('.dg-preview img').evaluate_all('elements => elements.map(element => element.getAttribute("src"))'))
    page.evaluate("localStorage.removeItem('station-design-preference')")
    page.reload(wait_until='networkidle')
    for width, height in [(1440, 1000), (390, 844), (360, 800)]:
        page.set_viewport_size({'width': width, 'height': height})
        for mode, label in [('mobile', '手机效果'), ('desktop', '电脑效果')]:
            page.get_by_role('button', name=label, exact=True).click()
            page.wait_for_load_state('networkidle')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
            assert page.locator('.dg-preview img').evaluate_all('elements => elements.every(image => image.complete && image.naturalWidth > 0)')
            page.screenshot(path=str(output / f'gallery-{mode}-{width}.png'))
            page.screenshot(path=str(output / f'gallery-{mode}-{width}-full.png'), full_page=True)
    record('gallery_real_previews_device_toggle_preference_persists_and_responsive')

    page.goto('/designs/x', wait_until='networkidle')
    expect(page.get_by_role('heading', name='这个页面找不到了')).to_be_visible()
    page.goto('/designs/a/software/missing-design-check', wait_until='networkidle')
    expect(page.get_by_role('link', name='前往软件目录')).to_have_attribute('href', '/designs/a/software')
    page.goto('/', wait_until='networkidle')
    assert page.locator('.dp-toolbar').count() == 0
    expect(page.locator('.st-header-review')).to_have_attribute('href', '/designs')
    record('missing_preview_recovery_and_current_site_intact')
    assert context.request.get('/api/v1/station/data').json() == before
    assert not errors, errors
    record('same_persistent_content_no_edits_no_browser_errors', software=len(before['software']), releases=len(before['releases']), announcements=len(before['announcements']))
    browser.close()

(output / 'verification.json').write_text(json.dumps({'status': 'passed', 'checks': checks, 'page_errors': errors}, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'status': 'passed', 'checks': len(checks), 'page_errors': errors}, ensure_ascii=False), flush=True)
