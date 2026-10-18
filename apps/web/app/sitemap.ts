import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/format';
import { getStationData, isPromotionActive } from '@/lib/station';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl().replace(/\/$/, '');
  const routes: MetadataRoute.Sitemap = ['', '/software', '/announcements'].map(path => ({ url: `${base}${path}` }));
  const data = await getStationData();
  routes.push(...data.software.filter(s => s.published).map(s => ({ url: `${base}/software/${encodeURIComponent(s.slug)}` })));
  routes.push(...data.announcements.filter(n => n.published).map(n => ({ url: `${base}/announcements/${encodeURIComponent(n.slug)}`, ...(n.published_at ? { lastModified: new Date(n.published_at) } : {}) })));
  if (data.settings.ads_enabled) routes.push(...data.promotions.filter(p => isPromotionActive(p)).map(p => ({ url: `${base}/promo/${encodeURIComponent(p.slug)}` })));
  return routes;
}
