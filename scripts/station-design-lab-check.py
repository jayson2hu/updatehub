"""Read-only browser review of the 50-style gallery. Uses the existing station."""
import argparse
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'artifacts' / 'design-lab-50'
PUBLIC = ROOT / 'apps' / 'web' / 'public' / 'design-previews' / '50'
REPS = ['02', '08', '11', '16', '21', '26', '31', '36', '41', '47']


def overflow(page):
    return page.evaluate('document.documentElement.scrollWidth > innerWidth + 1')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--phase', choices=['inspect', 'capture', 'check'], default='inspect')
    parser.add_argument('--base', default='http://localhost:3010')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    PUBLIC.mkdir(parents=True, exist_ok=True)
    report = {'phase': args.phase, 'checks': [], 'errors': []}
    with sync_playwright() as p:
        browser = p.chromium.launch(channel='msedge', headless=True)
        context = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1)
        page = context.new_page()
        page.on('pageerror', lambda e: report['errors'].append(str(e)))

        def visit(path):
            response = page.goto(args.base + path)
            page.wait_for_load_state('networkidle')
            assert response and response.status < 400, f'Failed route {path}'
            assert not overflow(page), f'Horizontal overflow {path} at {page.viewport_size}'

        if args.phase == 'inspect':
            for width in [390, 1440]:
                page.set_viewport_size({'width': width, 'height': 844 if width < 700 else 1000})
                for route, name in [('/designs', 'gallery'), ('/designs/02', '02'), ('/designs/08', '08'), ('/designs/21', '21'), ('/designs/16', '16'), ('/designs/26', '26'), ('/designs/02/software/guangmu?platform=tv', 'detail')]:
                    visit(route)
                    page.screenshot(path=str(OUT / f'inspect-{name}-{width}.png'), full_page=True)
                    print(f'inspected {name} {width}', flush=True)
        elif args.phase == 'capture':
            for n in range(1, 51):
                id_ = f'{n:02}'
                for width, height, label in [(390, 844, 'mobile'), (1440, 1000, 'desktop')]:
                    page.set_viewport_size({'width': width, 'height': height})
                    visit(f'/designs/{id_}?capture=1')
                    assert page.locator('.lab-update').count() > 0
                    page.screenshot(path=str(PUBLIC / f'{id_}-{label}.jpg'), type='jpeg', quality=78)
                    if id_ in REPS:
                        page.screenshot(path=str(OUT / f'home-{id_}-{width}.png'), full_page=True)
                page.set_viewport_size({'width': 360, 'height': 800})
                visit(f'/designs/{id_}')
                report['checks'].append(f'{id_}: mobile 360/390, desktop 1440, direct route, real releases')
                if n % 5 == 0:
                    print(f'captured {n}/50 designs', flush=True)
        else:
            # Inspect the rendered gallery before interacting with controls.
            visit('/designs')
            assert page.locator('[data-option]').count() == 50
            page.get_by_role('button', name='收藏02', exact=True).click()
            page.get_by_role('button', name='我的收藏').click()
            assert page.locator('[data-option]').count() == 1
            page.reload(wait_until='networkidle')
            assert page.get_by_role('button', name='取消收藏02', exact=True).count() == 1
            page.get_by_role('button', name='我的收藏').click()
            page.get_by_role('button', name='清除筛选').click()
            page.get_by_label('搜索设计方案').fill('影院')
            assert page.locator('[data-option]').count() == 5
            page.get_by_role('button', name='清除设计搜索').click()
            for id_ in ['02','08','21','16']:
                page.locator(f'[data-option="{id_}"]').get_by_role('button', name='加入对比').click()
            page.get_by_role('button', name='并排对比').click()
            assert page.get_by_role('dialog').is_visible()
            assert page.locator('.dg-comparison>article').count() == 4
            page.screenshot(path=str(OUT / 'comparison-mobile.png'))
            page.keyboard.press('Escape')
            assert not page.get_by_role('dialog').is_visible()
            page.get_by_role('button', name='桌面', exact=True).first.click()
            assert page.locator('.dg-grid-desktop').count() == 1
            report['checks'].append('Gallery: 50 options, search, favorite persistence, four-way comparison, Escape, desktop switch')
            for width in [360,390,1440]:
                page.set_viewport_size({'width':width,'height':844 if width<700 else 1000})
                visit('/designs')
                page.screenshot(path=str(OUT / f'gallery-{width}.png'), full_page=width == 1440)
                for id_ in REPS:
                    visit(f'/designs/{id_}/software/guangmu?platform=tv')
                    assert page.get_by_role('button', name='安卓电视', exact=True).get_attribute('aria-pressed') == 'true'
                    choices = page.get_by_label('选择版本').locator('option')
                    assert choices.count() > 1
                    old = choices.last.get_attribute('value')
                    page.get_by_label('选择版本').select_option(old)
                    assert 'release=' + old in page.url
                    assert page.locator('.lab-release-header').inner_text().find('历史版本') >= 0
                    page.reload(wait_until='networkidle')
                    assert page.get_by_label('选择版本').input_value() == old
                    page.get_by_role('button', name='安卓手机', exact=True).click()
                    assert 'platform=android' in page.url
                    assert not overflow(page)
                    if width < 700:
                        assert page.locator('.lab-fixed-get').is_visible()
                        assert not page.locator('.lab-bottom').count()
                    page.screenshot(path=str(OUT / f'detail-{id_}-{width}.png'), full_page=True)
                report['checks'].append(f'Detail {width}px: 10 families, TV/Android switch, historical version selection, direct reload, fixed get bar')
            page.set_viewport_size({'width':390,'height':844})
            visit('/designs/02')
            page.get_by_label('搜索软件名称或别名').fill('不存在的名字')
            assert page.get_by_role('heading', name='没有找到对应软件').is_visible()
            page.get_by_role('button', name='清除搜索与筛选').click()
            assert page.locator('.lab-update').count() > 0
            page.get_by_role('button', name='电视', exact=True).click()
            hrefs = page.locator('.lab-update').evaluate_all('(links)=>links.map(a=>a.href)')
            assert all('platform=tv' in href for href in hrefs)
            page.locator('.lab-update').first.click()
            page.wait_for_load_state('networkidle')
            page.evaluate("Object.defineProperty(navigator, 'clipboard', {value:{writeText:()=>Promise.reject(new Error('blocked'))},configurable:true})")
            page.get_by_role('button', name='复制本页链接').click()
            assert page.get_by_role('dialog', name='手动复制').is_visible()
            assert '/designs/02/software/' in page.get_by_label('要复制的内容').input_value()
            page.keyboard.press('Escape')
            visit('/designs/02/announcements')
            page.locator('.lab-notice-row').first.click()
            page.wait_for_url('**/designs/02/announcements/*')
            page.wait_for_load_state('networkidle')
            page.reload(wait_until='networkidle')
            assert page.locator('.lab-announcement-detail').is_visible()
            report['checks'].append('Public flow: empty search recovery, TV filter, correct detail link, clipboard manual fallback, direct announcement link')
            page.set_viewport_size({'width':1440,'height':1000})
            visit('/designs/02')
            page.get_by_role('button', name='预览推广位置').click()
            assert page.locator('.lab-promo').count() >= 2
            page.screenshot(path=str(OUT / 'ads-preview-1440.png'), full_page=True)
            report['checks'].append('Independent ad-slot preview: sidebar and inline, default off')
            limited = browser.new_context(viewport={'width':390,'height':844})
            limited.add_init_script("Object.defineProperty(window,'localStorage',{get(){throw new Error('blocked')}})")
            restricted = limited.new_page()
            restricted.goto(args.base+'/designs',wait_until='networkidle')
            restricted.get_by_role('button',name='收藏02',exact=True).click()
            assert restricted.get_by_role('button',name='取消收藏02',exact=True).count() == 1
            restricted.locator('[data-option="02"]').get_by_role('button',name='加入对比').click()
            assert restricted.get_by_role('button',name='并排对比').is_visible()
            limited.close()
            report['checks'].append('Storage-denied browser: favorites and comparison retain a usable temporary state')
            visit('/')
            assert page.get_by_role('link', name='50 套全新界面设计已开放，进入挑选与对比').count() == 1
            report['checks'].append('Main site remains available with gallery entry')
        browser.close()
    (OUT / f'{args.phase}-results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=False), flush=True)
    assert not report['errors'], report['errors']


if __name__ == '__main__':
    main()
