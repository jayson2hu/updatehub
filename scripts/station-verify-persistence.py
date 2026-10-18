"""Verify the E2E's saved records and image after a real API restart."""
import argparse
import hashlib
from http.cookiejar import CookieJar
import json
from pathlib import Path
from urllib.request import Request, build_opener, HTTPCookieProcessor

root = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--base-url', default='http://localhost:3010')
parser.add_argument('--credentials', type=Path, default=root / 'runtime' / 'station-admin.json')
parser.add_argument('--manifest', type=Path, default=root / 'artifacts' / 'station' / 'persistence-manifest.json')
args = parser.parse_args()
credentials = json.loads(args.credentials.read_text(encoding='utf-8-sig'))
manifest = json.loads(args.manifest.read_text(encoding='utf-8'))
base = args.base_url.rstrip('/')
opener = build_opener(HTTPCookieProcessor(CookieJar()))
request = Request(base + '/api/v1/admin/auth/login', data=json.dumps(credentials).encode(), headers={'Content-Type': 'application/json', 'Origin': base})
with opener.open(request) as response:
    assert response.status == 200
with opener.open(base + '/api/v1/admin/station/data') as response:
    data = json.load(response)
assert manifest['software_id'] in [s['id'] for s in data['software']], 'Saved software missing after restart'
assert set(manifest['release_ids']).issubset(r['id'] for r in data['releases']), 'Saved releases missing after restart'
assert set(manifest['announcement_ids']).issubset(n['id'] for n in data['announcements']), 'Saved notice missing after restart'
with opener.open(base + manifest['image_url']) as response:
    image_hash = hashlib.sha256(response.read()).hexdigest()
assert image_hash == manifest['image_sha256'], 'Uploaded image changed or disappeared after restart'
with opener.open(base + '/api/v1/station/data') as response:
    public = json.load(response)
assert len(public['software']) >= 6 and len(public['releases']) >= 8 and len(public['announcements']) >= 4
assert manifest['software_id'] not in [s['id'] for s in public['software']], 'Cleanup draft leaked to public'
result = {'status': 'passed', 'software': True, 'releases': True, 'announcements': True, 'uploaded_image_sha256': image_hash, 'public_seed_retained': True, 'drafts_remain_private': True}
(args.manifest.parent / 'persistence-result.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
print('PASS: saved software, versions, notice, public demo data, draft privacy and uploaded-image checksum survived service restart.')
