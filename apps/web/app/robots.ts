import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/format';

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/me', '/search', '/my-software', '/go/'] }, sitemap: `${siteUrl()}/sitemap.xml` };
}
