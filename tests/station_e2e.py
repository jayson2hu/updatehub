"""Real browser workflows for 更新小站. Run only against an isolated development DB.

Credentials: STATION_ADMIN_EMAIL/STATION_ADMIN_PASSWORD, or --credentials pointing
at an ignored local JSON file with email/password keys. No credentials in output.
"""
from __future__ import annotations

import argparse
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import time
import traceback

from PIL import Image
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


class StationQA:
    def __init__(self, args, browser):
        self.args, self.browser = args, browser
        self.base = args.base_url.rstrip('/')
        self.output = args.output.resolve()
        self.output.mkdir(parents=True, exist_ok=True)
        self.context = browser.new_context(base_url=self.base, viewport={'width': 1440, 'height': 1000}, locale='zh-CN', timezone_id='Asia/Shanghai')
        self.guest = browser.new_context(base_url=self.base, viewport={'width': 390, 'height': 844}, locale='zh-CN', timezone_id='Asia/Shanghai')
        self.page = self.context.new_page()
        self.public = self.guest.new_page()
        self.page.set_default_timeout(15000)
        self.public.set_default_timeout(15000)
        self.results = []
        self.errors = []
        self.context.on('page', lambda p: p.on('pageerror', lambda e: self.errors.append(str(e))))
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        self.public.on('pageerror', lambda e: self.errors.append(str(e)))
        self.csrf = ''
        self.software = None
        self.releases = []
        self.notices = []
        self.suffix = str(time.time_ns())[-12:]
        self.slug = 'qa-station-' + self.suffix
        self.name = '验收软件' + self.suffix
        self.alias = '验收别名' + self.suffix
        self.image_url = ''

    @contextmanager
    def check(self, name):
        started = time.monotonic()
        try:
            yield
            self.results.append({'name': name, 'status': 'passed', 'seconds': round(time.monotonic() - started, 2)})
            print('PASS ' + name, flush=True)
        except Exception as exc:
            self.results.append({'name': name, 'status': 'failed', 'error': str(exc), 'seconds': round(time.monotonic() - started, 2)})
            print('FAIL ' + name + ': ' + str(exc), flush=True)
            for label, page in [('admin', self.page), ('public', self.public)]:
                try:
                    page.screenshot(path=str(self.output / f'failure-{len(self.results)}-{label}.png'), full_page=True)
                except Exception:
                    pass

    def navigate(self, page, route):
        response = page.goto(self.base + route, wait_until='networkidle')
        return response

    def api(self, path, method='GET', data=None, admin=False, expected=None):
        context = self.context if admin else self.guest
        headers = {'Origin': self.base}
        if admin:
            headers['X-CSRF-Token'] = self.csrf
        response = context.request.fetch(self.base + '/api/v1' + path, method=method, data=data, headers=headers)
        if expected is not None:
            assert response.status == expected, (path, response.status, response.text())
        return response

    def snapshot(self, page, filename):
        page.screenshot(path=str(self.output / filename), full_page=True)

    def no_overflow(self, page):
        size = page.evaluate('({scroll: document.documentElement.scrollWidth, width: innerWidth})')
        assert size['scroll'] <= size['width'] + 1, size

    def credentials(self):
        email, password = os.getenv('STATION_ADMIN_EMAIL'), os.getenv('STATION_ADMIN_PASSWORD')
        if email and password:
            return email, password
        payload = json.loads(self.args.credentials.read_text(encoding='utf-8-sig'))
        return payload['email'], payload['password']

    def login(self):
        with self.check('管理员从登录页进入后台'):
            email, password = self.credentials()
            self.navigate(self.page, '/admin/login')
            self.snapshot(self.page, 'recon-admin-login.png')
            assert self.page.get_by_role('button', name='登录管理后台').count() == 1
            self.page.get_by_label('邮箱', exact=True).fill(email)
            self.page.locator('input[name="password"]').fill(password)
            self.page.get_by_role('button', name='登录管理后台').click()
            self.page.wait_for_url('**/admin')
            self.page.wait_for_load_state('networkidle')
            self.csrf = self.api('/admin/auth/me', admin=True, expected=200).json()['csrf_token']
            expect(self.page.get_by_role('heading', name='管理员登录')).to_have_count(0)

    def public_baseline(self):
        with self.check('真实数据库演示数据完整，广告默认关闭'):
            data = self.api('/station/data', expected=200).json()
            assert len(data['software']) >= 6
            assert len(data['releases']) >= 8
            assert len(data['announcements']) >= 4
            assert not data['settings']['ads_enabled']
            assert not data['promotions']
            assert any(len(s['platforms']) > 1 for s in data['software'])
            assert any(r['status'] == 'unavailable' for r in data['releases'])
            assert any(not r['links'] for r in data['releases'])
            assert any(n['expired'] for n in data['announcements'])
            self.seed_data = data
        with self.check('访客无法读取后台或执行管理操作'):
            self.api('/admin/station/data', expected=401)
            self.api('/admin/station/software', 'POST', {'name': 'unauthorized'}, expected=401)
            self.api('/admin/station/settings', 'PATCH', {'site_name': 'unauthorized'}, expected=401)
        with self.check('移动端首屏含有效公告和完整更新，搜索筛选与无结果可恢复'):
            self.navigate(self.public, '/')
            self.snapshot(self.public, 'recon-home-390.png')
            expect(self.public.get_by_label('搜索软件名称或别名')).to_be_visible()
            expect(self.public.locator('.st-pinned-wrap .st-notice')).to_be_visible()
            box = self.public.locator('.st-update-row').first.bounding_box()
            assert box and box['y'] + box['height'] < 844 - 50, box
            example = next(s for s in self.seed_data['software'] if s['aliases'] and any(r['software_id'] == s['id'] for r in self.seed_data['releases']))
            self.public.get_by_label('搜索软件名称或别名').fill(example['aliases'][0])
            expect(self.public.locator('.st-update-row').first).to_contain_text(example['name'])
            self.public.get_by_label('搜索软件名称或别名').fill('这肯定没有对应结果' + self.suffix)
            expect(self.public.get_by_role('heading', name='没有找到对应的更新')).to_be_visible()
            self.public.get_by_role('button', name='清除搜索和筛选').click()
            expect(self.public.get_by_label('搜索软件名称或别名')).to_have_value('')
            self.public.get_by_role('group', name='按设备筛选').get_by_role('button', name='电视', exact=True).click()
            assert all('platform=tv' in item for item in self.public.locator('.st-update-row').evaluate_all('(els) => els.map(e => e.getAttribute("href"))'))
            self.public.get_by_role('group', name='按设备筛选').get_by_role('button', name='全部', exact=True).click()
        with self.check('软件和公告分享链接可直达刷新，缺失页面提供返回入口'):
            software = self.seed_data['software'][0]
            self.navigate(self.public, '/software/' + software['slug'])
            self.public.reload(wait_until='networkidle')
            expect(self.public.get_by_role('heading', name=software['name'], exact=True)).to_be_visible()
            notice = self.seed_data['announcements'][0]
            self.navigate(self.public, '/announcements/' + notice['slug'])
            self.public.reload(wait_until='networkidle')
            expect(self.public.get_by_role('heading', name=notice['title'], exact=True)).to_be_visible()
            self.navigate(self.public, '/software/qa-not-existing-' + self.suffix)
            expect(self.public.get_by_role('link', name=re.compile('返回|软件目录')).first).to_be_visible()

    def create_software(self):
        with self.check('后台创建软件、真实上传图片、草稿保密、预览并发布'):
            self.navigate(self.page, '/admin/station/software/new')
            self.snapshot(self.page, 'recon-software-new.png')
            self.page.get_by_label('软件名称', exact=True).fill(self.name)
            self.page.get_by_label('常用别名', exact=False).fill(self.alias)
            self.page.get_by_label('一句话用途', exact=True).fill('端到端验收专用软件，验证手机与电视独立版本。')
            self.page.get_by_label('固定链接名称', exact=False).fill(self.slug)
            self.page.get_by_label('安卓电视', exact=True).check()
            self.page.get_by_label('安装步骤', exact=False).fill('先保留原来的设置。\n获取对应设备的安装文件。\n完成安装后核对版本。')
            icon = self.output / 'qa-icon.png'
            Image.new('RGB', (128, 128), '#245BDD').save(icon)
            with self.page.expect_response(lambda r: '/admin/station/uploads' in r.url and r.request.method == 'POST') as upload:
                self.page.locator('input[type=file][aria-label="上传软件图标"]').set_input_files(str(icon))
            assert upload.value.status == 201, upload.value.text()
            self.image_url = upload.value.json()['url']
            with self.page.expect_response(lambda r: '/admin/station/software' in r.url and r.request.method == 'POST') as saved:
                self.page.get_by_role('button', name='保存草稿', exact=True).click()
            assert saved.value.status == 201, saved.value.text()
            self.software = saved.value.json()
            self.api('/station/software/' + self.slug, expected=404)
            public = self.api('/station/data', expected=200).json()
            assert self.software['id'] not in [s['id'] for s in public['software']]
            self.page.get_by_role('button', name='预览', exact=True).click()
            expect(self.page.get_by_role('dialog')).to_contain_text(self.name)
            self.page.get_by_role('button', name='返回编辑', exact=True).click()
            with self.page.expect_response(lambda r: '/admin/station/software/' in r.url and r.request.method == 'PATCH') as published:
                self.page.get_by_role('button', name='发布', exact=True).click()
            assert published.value.status == 200, published.value.text()
            self.software = published.value.json()
            self.api('/station/software/' + self.slug, expected=200)
            assert self.guest.request.get(self.base + self.image_url).status == 200

    def release_workflow(self):
        if not self.software:
            return
        with self.check('发布更新表单保留失败内容，保存草稿、预览、发布后同步前台'):
            self.navigate(self.page, '/admin/station/releases/new?software=' + self.software['id'])
            self.snapshot(self.page, 'recon-release-new.png')
            self.page.get_by_label('版本号', exact=True).fill('9.1.0')
            self.page.get_by_label('一句话更新摘要', exact=False).fill('修复部分电视设备启动后黑屏的问题。')
            self.page.get_by_label('详细更新说明', exact=False).fill('改善播放稳定性。\n本次更新请先保留原来的设置。')
            self.page.get_by_role('button', name='添加入口', exact=True).click()
            self.page.get_by_label('获取链接 1', exact=True).fill('https://example.com/android-' + self.suffix)
            self.page.get_by_label('来源名称 1', exact=True).fill('验收示例来源（不提供软件）')
            self.page.get_by_label('提取码 1', exact=True).fill('qa12')
            self.page.get_by_label('安装前提醒', exact=False).fill('本次更新需要重新安装，请先查看安装步骤。')
            self.page.route('**/api/v1/admin/station/releases', lambda route: route.fulfill(status=503, content_type='application/json', body='{"detail":"验收模拟：暂时无法保存，请稍后重试"}'))
            self.page.get_by_role('button', name='保存草稿', exact=True).click()
            expect(self.page.locator('.sa-alert[role="alert"]')).to_contain_text('暂时无法保存')
            expect(self.page.get_by_label('版本号', exact=True)).to_have_value('9.1.0')
            self.page.unroute('**/api/v1/admin/station/releases')
            with self.page.expect_response(lambda r: '/admin/station/releases' in r.url and r.request.method == 'POST') as draft:
                self.page.get_by_role('button', name='保存草稿', exact=True).click()
            assert draft.value.status == 201, draft.value.text()
            release = draft.value.json()
            self.releases.append(release)
            public = self.api('/station/software/' + self.slug, expected=200).json()
            assert not public['releases']
            self.page.get_by_role('button', name='预览', exact=True).click()
            expect(self.page.get_by_role('dialog')).to_contain_text('9.1.0')
            self.page.get_by_role('button', name='返回编辑', exact=True).click()
            for width, height in [(1440, 1000), (390, 844), (360, 800)]:
                self.page.set_viewport_size({'width': width, 'height': height})
                self.no_overflow(self.page)
                self.snapshot(self.page, f'admin-release-{width}.png')
            self.page.set_viewport_size({'width': 1440, 'height': 1000})
            with self.page.expect_response(lambda r: '/admin/station/releases/' in r.url and r.request.method == 'PATCH') as publish:
                self.page.get_by_role('button', name='发布', exact=True).click()
            assert publish.value.status == 200, publish.value.text()
            self.releases[0] = publish.value.json()
            public = self.api('/station/data', expected=200).json()
            assert self.releases[0]['id'] in [r['id'] for r in public['releases']]
            self.navigate(self.public, '/')
            self.public.get_by_label('搜索软件名称或别名').fill(self.alias)
            expect(self.public.locator('.st-update-row')).to_contain_text('9.1.0')
        with self.check('安卓与电视版本、状态、获取链接及提取码准确对应'):
            tv = self.api('/admin/station/releases', 'POST', {'software_id': self.software['id'], 'platform': 'tv', 'version': '8.2.0', 'summary': '电视专属版本，修复遥控器焦点。', 'notes': '手机和电视版本分别维护。', 'published': True, 'links': [{'label': '电视验收来源', 'url': 'https://example.com/tv-' + self.suffix, 'code': 'tv88', 'is_primary': True}]}, admin=True, expected=201).json()
            self.releases.append(tv)
            self.navigate(self.public, '/software/' + self.slug + '?platform=android')
            expect(self.public.locator('.st-version-head')).to_contain_text('9.1.0')
            expect(self.public.locator('.st-download-actions').get_by_role('link', name='获取安卓版', exact=True)).to_have_attribute('href', 'https://example.com/android-' + self.suffix)
            expect(self.public.locator('.st-extraction')).to_contain_text('qa12')
            self.public.get_by_role('group', name='软件设备').get_by_role('button', name='安卓电视').click()
            expect(self.public.locator('.st-version-head')).to_contain_text('8.2.0')
            expect(self.public.locator('.st-download-actions').get_by_role('link', name='获取电视版')).to_have_attribute('href', 'https://example.com/tv-' + self.suffix)
            expect(self.public.locator('.st-extraction')).to_contain_text('tv88')
            assert 'platform=tv' in self.public.url
            self.public.reload(wait_until='networkidle')
            expect(self.public.locator('.st-version-head')).to_contain_text('8.2.0')

    def announcement_workflow(self):
        if not self.software:
            return
        with self.check('公告草稿不泄漏、有效置顶与软件关联、到期退顶、撤回失效'):
            payload = {'slug': self.slug + '-notice', 'title': '验收维护通知' + self.suffix, 'summary': '关联软件维护期间请暂缓安装。', 'body': '这是端到端验收公告。\n恢复后会在本站公告。', 'category': 'maintenance', 'importance': 'urgent', 'pinned': True, 'software_ids': [self.software['id']], 'published': False}
            self.navigate(self.page, '/admin/station/announcements/new')
            self.page.get_by_label('公告标题', exact=True).fill(payload['title'])
            self.page.get_by_label('简短摘要', exact=True).fill(payload['summary'])
            self.page.get_by_label('公告正文', exact=False).fill(payload['body'])
            self.page.get_by_label('固定链接名称', exact=False).fill(payload['slug'])
            self.page.get_by_label('公告分类', exact=False).select_option('maintenance')
            self.page.get_by_label('重要程度', exact=False).select_option('urgent')
            self.page.get_by_label('置顶显示在首页', exact=True).check()
            self.page.get_by_label(self.name, exact=True).check()
            with self.page.expect_response(lambda r: '/admin/station/announcements' in r.url and r.request.method == 'POST') as saved:
                self.page.get_by_role('button', name='保存草稿', exact=True).click()
            assert saved.value.status == 201, saved.value.text()
            notice = saved.value.json()
            self.notices.append(notice)
            self.api('/station/announcements/' + notice['slug'], expected=404)
            assert notice['id'] not in [n['id'] for n in self.api('/station/data', expected=200).json()['announcements']]
            self.page.get_by_role('button', name='预览', exact=True).click()
            expect(self.page.get_by_role('dialog')).to_contain_text(notice['title'])
            self.page.get_by_role('button', name='返回编辑', exact=True).click()
            with self.page.expect_response(lambda r: '/admin/station/announcements/' in r.url and r.request.method == 'PATCH') as published:
                self.page.get_by_role('button', name='发布', exact=True).click()
            assert published.value.status == 200, published.value.text()
            self.navigate(self.public, '/')
            expect(self.public.locator('.st-pinned-wrap')).to_contain_text(notice['title'])
            self.navigate(self.public, '/software/' + self.slug)
            expect(self.public.locator('.st-notice')).to_contain_text(notice['title'])
            self.navigate(self.public, '/announcements/' + notice['slug'])
            expect(self.public.get_by_role('heading', name=notice['title'], exact=True)).to_be_visible()
            self.page.get_by_label('到期时间', exact=False).fill('2020-01-01T12:00')
            with self.page.expect_response(lambda r: '/admin/station/announcements/' in r.url and r.request.method == 'PATCH') as expired:
                self.page.get_by_role('button', name='保存修改', exact=True).click()
            assert expired.value.status == 200, expired.value.text()
            ended = self.api('/station/announcements/' + notice['slug'], expected=200).json()
            assert ended['expired'] and not ended['effective_pinned']
            self.navigate(self.public, '/')
            expect(self.public.locator('.st-pinned-wrap')).not_to_contain_text(notice['title'])
            self.navigate(self.public, '/announcements/' + notice['slug'])
            expect(self.public.get_by_text('已结束', exact=False).first).to_be_visible()
            with self.page.expect_response(lambda r: '/admin/station/announcements/' in r.url and r.request.method == 'PATCH') as withdrawn:
                self.page.get_by_role('button', name='撤回为草稿', exact=True).click()
            assert withdrawn.value.status == 200, withdrawn.value.text()
            self.api('/station/announcements/' + notice['slug'], expected=404)

    def clipboard_and_responsive(self):
        software = next(s for s in self.seed_data['software'] if len(s['platforms']) > 1)
        detail = '/software/' + software['slug']
        with self.check('复制成功有反馈，权限拒绝提供可选文本手动复制'):
            self.navigate(self.public, detail)
            self.public.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText: async value => {window.__qaCopied=value}}})")
            self.public.get_by_role('button', name='复制本页链接', exact=True).first.click()
            expect(self.public.get_by_role('button', name='已复制', exact=True).first).to_be_visible()
            assert self.public.evaluate('window.__qaCopied') == self.public.url
            self.public.evaluate("Object.defineProperty(navigator, 'clipboard', {configurable:true, value:{writeText: async () => {throw new Error('denied')}}})")
            self.public.get_by_role('button', name='已复制', exact=True).first.click()
            expect(self.public.get_by_role('dialog', name='手动复制')).to_be_visible()
            expect(self.public.get_by_label('要复制的内容')).to_have_value(self.public.url)
            self.public.keyboard.press('Escape')
            expect(self.public.get_by_role('dialog', name='手动复制')).not_to_be_visible()
        with self.check('390、1440、360 屏宽截图检查，无横向溢出和底栏遮挡'):
            for width, height in [(390, 844), (1440, 1000), (360, 800)]:
                self.public.set_viewport_size({'width': width, 'height': height})
                for route, filename in [('/', 'home'), (detail, 'software')]:
                    self.navigate(self.public, route)
                    self.no_overflow(self.public)
                    self.snapshot(self.public, f'{filename}-{width}.png')
                if width < 600:
                    fixed = self.public.locator('.st-fixed-get').bounding_box()
                    assert fixed and fixed['y'] + fixed['height'] <= height + 1, fixed
                    nav = self.public.locator('.st-bottom-nav')
                    if nav.count() and nav.is_visible():
                        n = nav.bounding_box()
                        assert fixed['y'] + fixed['height'] <= n['y'] + 1 or n['y'] + n['height'] <= fixed['y'] + 1, (fixed, n)
                    self.public.evaluate('window.scrollTo(0, document.body.scrollHeight)')
                    history = self.public.locator('.st-history').bounding_box()
                    assert history and history['y'] + history['height'] <= fixed['y'] + 1, (history, fixed)
            self.public.set_viewport_size({'width': 390, 'height': 844})
        with self.check('缺少获取入口和暂不可用状态没有伪下载操作'):
            for state in ['no-link', 'unavailable']:
                release = next(r for r in self.seed_data['releases'] if (r['status'] == 'unavailable' if state == 'unavailable' else not r['links'] and r['status'] != 'unavailable'))
                item = next(s for s in self.seed_data['software'] if s['id'] == release['software_id'])
                self.navigate(self.public, f"/software/{item['slug']}?platform={release['platform']}&release={release['id']}")
                expect(self.public.locator('.st-unavailable')).to_contain_text('暂时无法使用' if state == 'unavailable' else '暂未配置获取链接')
                expect(self.public.locator('.st-download-actions a')).to_have_count(0)

    def cleanup(self):
        if not self.csrf:
            return
        for notice in self.notices:
            self.api('/admin/station/announcements/' + notice['id'], 'PATCH', {'published': False}, admin=True)
        for release in self.releases:
            self.api('/admin/station/releases/' + release['id'], 'PATCH', {'published': False}, admin=True)
        if self.software:
            self.api('/admin/station/software/' + self.software['id'], 'PATCH', {'published': False}, admin=True)
            image = self.guest.request.get(self.base + self.image_url) if self.image_url else None
            manifest = {'software_id': self.software['id'], 'software_slug': self.slug, 'image_url': self.image_url, 'image_sha256': hashlib.sha256(image.body()).hexdigest() if image and image.ok else None, 'release_ids': [r['id'] for r in self.releases], 'announcement_ids': [n['id'] for n in self.notices], 'note': 'Test content is unpublished. Verify this record and image after restarting the API.'}
            (self.output / 'persistence-manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding='utf-8')

    def run(self):
        try:
            self.public_baseline()
            self.login()
            if self.csrf:
                self.create_software()
                self.release_workflow()
                self.announcement_workflow()
                self.cleanup()
            self.clipboard_and_responsive()
        finally:
            try:
                self.cleanup()
            except Exception as exc:
                self.results.append({'name': '测试内容下架清理', 'status': 'failed', 'error': str(exc)})
            with self.check('浏览器未出现未处理脚本异常'):
                assert not self.errors, self.errors
            report = {'base_url': self.base, 'time_utc': datetime.now(timezone.utc).isoformat(), 'results': self.results, 'browser_errors': self.errors}
            (self.output / 'results.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
            self.context.close()
            self.guest.close()
        failed = sum(r['status'] == 'failed' for r in self.results)
        print(f'{len(self.results) - failed} passed, {failed} failed; evidence: {self.output}', flush=True)
        return failed


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--base-url', default='http://localhost:3010')
    parser.add_argument('--credentials', type=Path, default=ROOT / 'runtime' / 'station-admin.json')
    parser.add_argument('--output', type=Path, default=ROOT / 'artifacts' / 'station')
    parser.add_argument('--channel', default=None, help='Use msedge for the installed Edge browser')
    args = parser.parse_args()
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, channel=args.channel)
        try:
            failed = StationQA(args, browser).run()
        finally:
            browser.close()
    sys.exit(1 if failed else 0)


if __name__ == '__main__':
    main()
