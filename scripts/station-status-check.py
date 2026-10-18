"""Check overall/platform status consistency using demo data, then restore it.

Use only the local demo site. Requires an is_demo multi-platform software record.
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
with sync_playwright() as p:
    browser = p.chromium.launch(channel=args.channel, headless=True)
    context = browser.new_context(base_url=base, viewport={'width': 390, 'height': 844}, locale='zh-CN')
    credentials = json.loads(args.credentials.read_text(encoding='utf-8-sig'))
    session = context.request.post(base + '/api/v1/admin/auth/login', data=credentials, headers={'Origin': base})
    assert session.status == 200, session.status
    headers = {'Origin': base, 'X-CSRF-Token': session.json()['csrf_token']}
    data = context.request.get(base + '/api/v1/admin/station/data').json()
    software = next(s for s in data['software'] if s['is_demo'] and 'tv' in s['platforms'] and 'android' in s['platforms'])
    tv = sorted([r for r in data['releases'] if r['software_id'] == software['id'] and r['platform'] == 'tv' and r['published']], key=lambda r: r['published_at'], reverse=True)[0]

    def patch(kind, item_id, values):
        response = context.request.patch(base + '/api/v1/admin/station/' + kind + '/' + item_id, data=values, headers=headers)
        assert response.status == 200, response.text()

    page = context.new_page()
    try:
        patch('software', software['id'], {'status': 'unavailable', 'status_reason': '验收：整个软件暂不可用'})
        page.goto(base + '/', wait_until='networkidle')
        rows = page.locator('.st-update-row').filter(has=page.get_by_role('heading', name=software['name'], exact=True))
        assert rows.count() > 0
        for row in rows.all():
            expect(row).to_contain_text('暂时无法使用')
        page.goto(base + '/software/' + software['slug'] + '?platform=android', wait_until='networkidle')
        expect(page.locator('.st-version-section .st-status')).to_contain_text('暂时无法使用')
        patch('software', software['id'], {'status': 'normal', 'status_reason': ''})
        patch('releases', tv['id'], {'status': 'unavailable', 'status_reason': '验收：只有电视暂不可用'})
        page.goto(base + '/software', wait_until='networkidle')
        card = page.locator('.st-software-card').filter(has=page.get_by_role('heading', name=software['name'], exact=True))
        expect(card).to_contain_text('需要注意')
        page.get_by_role('group', name='按设备筛选').get_by_role('button', name='电视', exact=True).click()
        expect(card).to_contain_text('暂时无法使用')
        page.get_by_role('group', name='按设备筛选').get_by_role('button', name='安卓', exact=True).click()
        expect(card).to_contain_text('正常使用')
        page.goto(base + '/software/' + software['slug'] + '?platform=tv', wait_until='networkidle')
        expect(page.locator('.st-version-section .st-status')).to_contain_text('暂时无法使用')
        page.get_by_role('group', name='软件设备').get_by_role('button', name='安卓手机').click()
        expect(page.locator('.st-version-section .st-status')).to_contain_text('正常使用')
        result = {'status': 'passed', 'overall_unavailable_propagates_to_feed_and_detail': True, 'mixed_directory_caution': True, 'platform_filter_status': True, 'detail_platform_status': True}
        (root / 'artifacts' / 'station' / 'status-consistency-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
        print('PASS: overall unavailable status and platform-specific statuses agree across feed, directory and software detail.')
    finally:
        patch('software', software['id'], {k: software[k] for k in ['status', 'status_reason']})
        patch('releases', tv['id'], {k: tv[k] for k in ['status', 'status_reason']})
        browser.close()
