import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { StationChrome } from '@/components/station/chrome';
import { themeBootScript } from '@/lib/theme';
import { getStationData } from '@/lib/station';
import type { Settings, StationData } from '@/lib/station-types';
import { siteUrl } from '@/lib/format';
import { detectInApp, latestMarkers } from '@/lib/station-view';
import './base.css';
// Legacy styles are confined to the admin layout; visitors only load v4.
import './station-v4.css';
export const dynamic = 'force-dynamic';

const FALLBACK: Settings = { site_name: '版本喵', site_description: '软件更新、安装说明和群公告，都在这里', instructions: '', ads_enabled: false };
async function station(): Promise<StationData | null> { try { return await getStationData(); } catch { return null; } }

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: [{ media: '(prefers-color-scheme: light)', color: '#F5F0E6' }, { media: '(prefers-color-scheme: dark)', color: '#16130F' }] };

export async function generateMetadata(): Promise<Metadata> {
  const s = (await station())?.settings || FALLBACK;
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: `${s.site_name} · 群友整理的软件更新`, template: `%s | ${s.site_name}` },
    description: s.site_description,
    applicationName: s.site_name,
    openGraph: { locale: 'zh_CN', type: 'website', siteName: s.site_name, title: s.site_name, description: s.site_description },
  };
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const data = await station();
  const ua = (await headers()).get('user-agent') || '';
  // suppressHydrationWarning: the boot script sets data-theme before React hydrates.
  return <html lang="zh-CN" data-theme="system" suppressHydrationWarning><head><script dangerouslySetInnerHTML={{ __html: themeBootScript }}/></head><body>
    <StationChrome settings={data?.settings || FALLBACK} inApp={detectInApp(ua)} latest={data ? latestMarkers(data.releases) : {}}>{children}</StationChrome>
  </body></html>;
}
