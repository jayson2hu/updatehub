import type { Metadata } from 'next';
import { StationChrome } from '@/components/station/chrome';
import { getStationData } from '@/lib/station';
import type { Settings } from '@/lib/station-types';
import { siteUrl } from '@/lib/format';
import './globals.css';
import './announcement.css';
import './version-history.css';
import './product-workflows.css';
import './product-design.css';
import './station-design.css';
export const dynamic = 'force-dynamic';
async function settings(): Promise<Settings> { try { return (await getStationData()).settings; } catch { return { site_name: '更新小站', site_description: '软件更新、安装说明和群公告，都在这里。', instructions: '', ads_enabled: false }; } }
export async function generateMetadata(): Promise<Metadata> { const s = await settings(); return { metadataBase: new URL(siteUrl()), title: { default: `${s.site_name} · 软件更新与群公告`, template: `%s | ${s.site_name}` }, description: s.site_description, openGraph: { locale: 'zh_CN', type: 'website', siteName: s.site_name, title: s.site_name, description: s.site_description } }; }
export default async function RootLayout({ children }: { children: React.ReactNode }) { const s = await settings(); return <html lang="zh-CN"><body><StationChrome settings={s}>{children}</StationChrome></body></html>; }
