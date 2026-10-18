"""Full browser acceptance on an isolated site/database copy (never production)."""
import argparse
import hashlib
import json
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

from PIL import Image
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://localhost:3011')
parser.add_argument('--channel', default='msedge')
args = parser.parse_args()
out = ROOT / 'artifacts/redesign-20261015/acceptance'
out.mkdir(parents=True, exist_ok=True)
results = []


def passed(name):
    results.append(name)
    print('PASS ' + name, flush=True)


with sync_playwright() as p:
    browser = p.chromium.launch(channel=args.channel, headless=True)
    admin = browser.new_context(base_url=args.base_url, viewport={'width': 1440, 'height': 1000}, locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    guest = browser.new_context(base_url=args.base_url, viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Shanghai', reduced_motion='reduce')
    page = admin.new_page(); public = guest.new_page(); errors = []
    page.on('pageerror', lambda e: errors.append(str(e))); public.on('pageerror', lambda e: errors.append(str(e)))
    page.set_default_timeout(15000); public.set_default_timeout(15000)

    def visit(target, path):
        response = target.goto(path, wait_until='networkidle')
        assert response is not None
        return response

    def field(label, value):
        page.get_by_label(label, exact=True).fill(value)

    def save(path, intent):
        with page.expect_response(lambda response: response.request.method in ['POST', 'PATCH'] and '/api/v1/admin/station/' + path in response.url) as pending:
            page.locator(f'.sa-save-bar button[value="{intent}"]').click()
        response = pending.value
        assert response.ok, response.text()
        return response.json()

    def mutate(path, payload):
        response = admin.request.patch('/api/v1/admin/station/' + path, data=payload, headers={'X-CSRF-Token': csrf})
        assert response.ok, response.text()
        return response.json()

    try:
        visit(page, '/admin/login')
        credentials = json.loads((ROOT / 'runtime/station-admin.json').read_text(encoding='utf-8-sig'))
        field('邮箱', credentials['email']); field('密码', credentials['password'])
        page.get_by_role('button', name='登录管理后台').click(); page.wait_for_url('**/admin'); page.wait_for_load_state('networkidle')
        csrf = admin.request.get('/api/v1/admin/auth/me').json()['csrf_token']
        assert guest.request.get('/api/v1/admin/station/data').status == 401
        for path in ['software', 'releases', 'announcements', 'promotions']:
            assert guest.request.post('/api/v1/admin/station/' + path, data={}).status == 401
        passed('administrator_login_and_guest_write_protection')

        suffix = str(time.time_ns())[-10:]; slug = 'versions-qa-' + suffix; name = '版本验收软件' + suffix
        fixture = out / 'upload.png'; Image.new('RGB', (960, 540), '#245bdd').save(fixture)
        visit(page, '/admin/station/software/new')
        field('软件名称', name); field('常用别名', '版本验收别名' + suffix); field('一句话用途', '隔离验收示例，检查不同设备与版本的获取入口。'); field('固定链接名称', slug)
        field('安装步骤', '确认设备与版本。\n按所选版本的提醒安装。')
        page.get_by_label('安卓电视', exact=True).check(); page.get_by_label('标记为示例软件').check()
        with page.expect_response(lambda response: '/admin/station/uploads' in response.url and response.request.method == 'POST') as upload:
            page.get_by_label('上传软件图标', exact=True).set_input_files(str(fixture))
        assert upload.value.status == 201; image_url = upload.value.json()['url']
        expect(page.get_by_alt_text('软件图标预览')).to_be_visible()
        software = save('software', 'draft')
        assert guest.request.get('/api/v1/station/software/' + slug).status == 404
        software = save('software', 'publish')
        assert guest.request.get('/api/v1/station/software/' + slug).status == 200
        passed('software_create_upload_draft_publish')

        versions = []
        for platform, version, code in [('android', '1.0', 'OLD1'), ('android', '2.0', 'NEW2'), ('tv', '8.0', 'TV08')]:
            visit(page, '/admin/station/releases/new?software=' + software['id'])
            page.get_by_label('对应设备', exact=True).select_option(platform)
            field('版本号', version); field('一句话更新摘要', '修复部分设备启动后黑屏的问题。' if version == '2.0' else '此版本独立的更新说明。')
            field('详细更新说明', '按当前设备与版本提供文件，保留其他版本。'); field('安装前提醒', f'{platform} {version} 安装提醒')
            if page.get_by_label('获取链接 1', exact=True).count() == 0: page.get_by_role('button', name='添加入口', exact=True).click()
            field('来源名称 1', f'{platform}-{version} 示例来源'); field('获取链接 1', f'https://example.com/{platform}/{version}.apk'); field('提取码 1', code)
            draft = save('releases', 'draft')
            assert all(r['id'] != draft['id'] for r in guest.request.get('/api/v1/station/data').json()['releases'])
            page.get_by_role('button', name='预览', exact=True).click(); expect(page.get_by_role('dialog')).to_contain_text(version)
            page.get_by_role('button', name='返回编辑', exact=True).click()
            versions.append(save('releases', 'publish'))
        passed('three_independent_device_version_downloads_draft_preview_publish')

        visit(public, '/software/' + slug + '?platform=android')
        expect(public.locator('.st-version-head>strong')).to_have_text('v2.0')
        assert public.locator('.st-download-actions a').get_attribute('href').endswith('/android/2.0.apk')
        expect(public.locator('.st-extraction strong')).to_have_text('NEW2')
        public.get_by_role('button', name='v1.0', exact=False).click()
        expect(public.locator('.st-version-head>strong')).to_have_text('v1.0')
        assert public.locator('.st-download-actions a').get_attribute('href').endswith('/android/1.0.apk')
        expect(public.locator('.st-extraction strong')).to_have_text('OLD1')
        expect(public.locator('.st-install-notice')).to_contain_text('android 1.0')
        expect(public.locator('.st-fixed-get')).to_contain_text('历史版')
        old_url = public.url; public.reload(wait_until='networkidle')
        expect(public.locator('.st-version-head>strong')).to_have_text('v1.0')
        public.get_by_role('button', name='安卓电视', exact=True).click()
        expect(public.locator('.st-version-head>strong')).to_have_text('v8.0')
        assert public.locator('.st-download-actions a').get_attribute('href').endswith('/tv/8.0.apk')
        expect(public.locator('.st-extraction strong')).to_have_text('TV08')
        expect(public.locator('.st-fixed-get')).to_contain_text('安卓电视')
        mutate('releases/' + versions[0]['id'], {'status': 'unavailable', 'status_reason': '旧版已停止服务'})
        visit(public, old_url); expect(public.locator('.st-unavailable')).to_contain_text('旧版已停止服务')
        expect(public.locator('.st-download-actions a')).to_have_count(0)
        public.get_by_role('group', name='选择下载版本').get_by_role('button', name='v2.0', exact=False).click()
        expect(public.locator('.st-download-actions a')).to_have_count(1)
        passed('old_version_link_code_notice_share_reload_device_switch_and_disable_isolation')

        visit(page, '/admin/station/announcements/new')
        field('公告标题', '版本验收重要公告'); field('简短摘要', '电视版安装前请查看步骤。'); field('公告正文', '这条公告关联验收软件，到期后保留历史详情。'); field('固定链接名称', slug + '-notice')
        page.get_by_label('重要程度', exact=True).select_option('urgent'); page.get_by_label('置顶显示在首页').check(); page.get_by_label(name, exact=True).check()
        announcement = save('announcements', 'draft')
        assert guest.request.get('/api/v1/station/announcements/' + announcement['slug']).status == 404
        announcement = save('announcements', 'publish')
        visit(public, '/'); expect(public.locator('.st-pinned-wrap')).to_contain_text('版本验收重要公告')
        visit(public, '/software/' + slug); expect(public.locator('.st-detail-page>.st-notice')).to_contain_text('版本验收重要公告')
        mutate('announcements/' + announcement['id'], {'expires_at': (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()})
        visit(public, '/'); expect(public.locator('.st-pinned-wrap')).not_to_contain_text('版本验收重要公告')
        visit(public, '/announcements/' + announcement['slug']); expect(public.locator('.st-expired-notice')).to_contain_text('已结束')
        mutate('announcements/' + announcement['id'], {'published': False})
        assert guest.request.get('/api/v1/station/announcements/' + announcement['slug']).status == 404
        visit(public, '/announcements/' + announcement['slug']); expect(public.get_by_role('heading', name='这个页面找不到了')).to_be_visible()
        passed('announcement_ui_draft_publish_pin_association_expiry_and_withdrawal')

        visit(page, '/admin/station/promotions/new')
        field('推广标题', '隔离验收推广'); field('分享链接标识', slug + '-promo'); field('简短介绍', '这是一条独立推广，软件获取入口保持不变。'); field('活动正文', '活动介绍，明确标注为推广。'); field('活动目标链接', 'https://example.com/campaign')
        page.get_by_label('软件详情正文', exact=True).check(); page.get_by_label('桌面端侧栏', exact=True).check()
        with page.expect_response(lambda response: '/admin/station/uploads' in response.url and response.request.method == 'POST') as upload:
            page.get_by_label('上传推广封面', exact=True).set_input_files(str(fixture))
        assert upload.value.status == 201
        promotion = save('promotions', 'draft')
        assert guest.request.get('/api/v1/station/promo/' + promotion['slug']).status == 404
        page.get_by_role('button', name='预览', exact=True).click(); expect(page.get_by_role('dialog')).to_contain_text('推广')
        page.get_by_role('button', name='返回编辑', exact=True).click()
        promotion = save('promotions', 'publish')
        visit(public, '/'); expect(public.locator('.st-ad-slot')).to_have_count(0)
        visit(page, '/admin/station/promotions'); page.get_by_role('button', name='启用广告', exact=True).click()
        expect(page.locator('.sa-ad-control')).to_contain_text('已启用')
        visit(public, '/'); public.locator('.st-ad-slot').first.scroll_into_view_if_needed(); expect(public.locator('.st-ad-slot:visible').first).to_contain_text('推广')
        visit(public, '/software/' + slug + '?platform=android'); public.locator('.st-ad-slot').first.scroll_into_view_if_needed(); expect(public.locator('.st-ad-slot:visible').first).to_contain_text('隔离验收推广')
        assert public.locator('.st-download-actions a').get_attribute('href').endswith('/android/2.0.apk')
        visit(public, '/promo/' + promotion['slug']); assert public.locator('.st-promotion-button').get_attribute('href') == 'https://example.com/campaign'
        visit(page, '/admin/station/promotions/' + promotion['id'])
        field('活动目标链接', 'https://example.com/edited'); page.get_by_label('结束时间', exact=True).fill('2020-01-01T12:00')
        promotion = save('promotions', 'publish')
        visit(public, '/'); expect(public.locator('.st-ad-slot')).to_have_count(0)
        visit(public, '/promo/' + promotion['slug']); expect(public.locator('.st-article-meta')).to_contain_text('已结束'); expect(public.locator('.st-promotion-button')).to_have_count(0)
        passed('promotion_ui_upload_draft_preview_publish_master_switch_positions_and_expiry')

        promotion = mutate('promotions/' + promotion['id'], {'ends_at': None})
        public.route('**' + promotion['cover_url'], lambda route: route.abort())
        visit(public, '/software/' + slug + '?platform=android'); public.locator('.st-ad-slot').first.scroll_into_view_if_needed()
        expect(public.locator('.st-ad-slot:visible')).to_have_count(0)
        expect(public.locator('.st-download-actions a')).to_have_count(1)
        public.unroute('**' + promotion['cover_url'])
        mutate('promotions/' + promotion['id'], {'ends_at': (datetime.now(timezone.utc) + timedelta(seconds=8)).isoformat()})
        visit(public, '/software/' + slug + '?platform=android'); public.locator('.st-ad-slot').first.scroll_into_view_if_needed()
        expect(public.locator('.st-ad-slot')).to_have_count(0, timeout=12000)
        mutate('settings', {'ads_enabled': False})
        assert guest.request.get('/api/v1/station/promo/' + promotion['slug']).status == 404
        passed('advertisement_image_failure_live_expiry_and_master_off_preserve_downloads')

        visit(public, '/'); public.get_by_label('搜索软件名称或别名').fill('版本验收别名' + suffix)
        expect(public.locator('.st-update-row')).to_have_count(3)
        public.get_by_role('button', name='电视', exact=True).click(); expect(public.locator('.st-update-row')).to_have_count(1)
        public.get_by_label('搜索软件名称或别名').fill('没有这款软件'); expect(public.get_by_role('heading', name='没有找到对应的更新')).to_be_visible()
        public.get_by_role('button', name='清除搜索和筛选').click(); expect(public.locator('.st-update-row').first).to_be_visible()
        visit(public, '/software/' + slug + '?platform=tv')
        public.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw new Error('denied')}}})")
        public.get_by_role('button', name='复制本页链接', exact=True).first.click(); expect(public.get_by_role('dialog', name='手动复制')).to_be_visible()
        assert 'platform=tv' in public.get_by_label('要复制的内容').input_value()
        public.keyboard.press('Escape'); expect(public.get_by_role('dialog')).to_have_count(0)
        public.evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copied=value}}})")
        public.get_by_role('button', name='复制链接', exact=True).click(); expect(public.get_by_role('button', name='已复制', exact=True)).to_be_visible()
        assert public.evaluate('window.copied').endswith('/tv/8.0.apk')
        passed('search_alias_device_empty_reset_copy_success_and_permission_fallback')

        for width, height in [(360, 800), (390, 844), (1440, 1000)]:
            for target in [page, public]: target.set_viewport_size({'width': width, 'height': height})
            for path, label in [('/', 'home'), ('/software', 'directory'), ('/software/guangmu?platform=tv', 'detail'), ('/announcements', 'announcements')]:
                visit(public, path); assert public.evaluate('document.documentElement.scrollWidth<=innerWidth'), (label, width)
                public.screenshot(path=str(out / f'{label}-{width}.png'), full_page=True)
                if path == '/' and width < 640:
                    first = public.locator('.st-update-row').first.bounding_box(); nav = public.locator('.st-bottom-nav').bounding_box()
                    assert first['y'] + first['height'] < nav['y'], (first, nav)
                if label == 'detail' and width < 640:
                    assert not public.locator('.st-bottom-nav').is_visible()
                    assert public.locator('.st-fixed-get').bounding_box()['height'] >= 68
            for path, label in [('/admin/station/releases/new','release'),('/admin/station/announcements/new','notice'),('/admin/station/promotions/new','promotion'),('/admin/station/releases','version-list'),('/admin/station/software/new','software-editor')]:
                visit(page,path); assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), (label,width)
                page.screenshot(path=str(out/f'admin-{label}-{width}.png'),full_page=True)
        passed('mobile_360_390_desktop_1440_no_overflow_complete_first_update_fixed_bar_and_admin_forms')

        visit(public, '/designs/a/software/' + slug + '?platform=tv&release=' + versions[2]['id'])
        assert '/designs/' not in public.url
        expect(public.locator('.st-version-head>strong')).to_have_text('v8.0')
        assert not errors, errors
        image_response = guest.request.get(image_url); assert image_response.ok
        manifest = {'software_slug': slug, 'software_id': software['id'], 'release_ids': [r['id'] for r in versions], 'promotion_id': promotion['id'], 'promotion_slug': promotion['slug'], 'image_url': image_url, 'image_sha256': hashlib.sha256(image_response.body()).hexdigest()}
        (out/'persistence.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf-8')
        passed('retired_preview_links_preserve_platform_release_and_no_page_errors')
    except Exception:
        page.screenshot(path=str(out/'failure-admin.png'),full_page=True);public.screenshot(path=str(out/'failure-public.png'),full_page=True)
        raise
    finally:
        (out/'results.json').write_text(json.dumps({'passed':results,'page_errors':errors},ensure_ascii=False,indent=2),encoding='utf-8')
        browser.close()
