import type { Metadata } from 'next';
import { getStationData } from '@/lib/station';
import { SearchView } from '@/components/station/search';
import { PageView } from '@/components/station/page-view';

type Query = { q?: string | string[] };
export const metadata: Metadata = { title: '搜索', description: '搜软件名、用途或公告。', robots: { index: false, follow: true } };

export default async function SearchPage({ searchParams }: { searchParams: Promise<Query> }) {
  const raw = (await searchParams).q;
  const q = (Array.isArray(raw) ? raw[0] : raw || '').slice(0, 60);
  const data = await getStationData();
  // 热门搜索：后台配置优先，未配置时用近 7 天有结果的搜索词（R-SEARCH-02）。
  const hot = data.settings.hot_searches?.length ? data.settings.hot_searches : data.stats?.hot_searches || [];
  return <><PageView name="search"/><SearchView software={data.software} releases={data.releases} announcements={data.announcements} hot={hot} initialQuery={q}/></>;
}
