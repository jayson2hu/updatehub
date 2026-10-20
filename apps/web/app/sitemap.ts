import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/format';
import { getStationData, isPromotionActive } from '@/lib/station';
import { byPublishedDesc } from '@/lib/station-view';

export const dynamic = 'force-dynamic';

// 收录公开页面；/me、/search 是个人或即时结果页，不收录（robots 同步屏蔽）。
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().replace(/\/$/, '');
  const data = await getStationData();
  const newest = [...data.releases].sort(byPublishedDesc)[0]?.published_at;
  const routes: MetadataRoute.Sitemap = [
    { url: `${base}/`, ...(newest ? { lastModified: new Date(newest) } : {}), changeFrequency: 'daily', priority: 1 },
    { url: `${base}/software`, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/announcements`, changeFrequency: 'daily', priority: 0.7 },
    { url: `${base}/about`, changeFrequency: 'monthly', priority: 0.3 },
  ];
  for (const s of data.software.filter(s => s.published)) {
    const last = data.releases.filter(r => r.software_id === s.id).sort(byPublishedDesc)[0]?.published_at;
    routes.push({ url: `${base}/software/${encodeURIComponent(s.slug)}`, ...(last ? { lastModified: new Date(last) } : {}), changeFrequency: 'weekly', priority: 0.9 });
  }
  routes.push(...data.announcements.filter(n => n.published).map(n => ({ url: `${base}/announcements/${encodeURIComponent(n.slug)}`, ...(n.published_at ? { lastModified: new Date(n.published_at) } : {}) })));
  if (data.settings.ads_enabled) routes.push(...data.promotions.filter(p => isPromotionActive(p)).map(p => ({ url: `${base}/promo/${encodeURIComponent(p.slug)}` })));
  return routes;
}
