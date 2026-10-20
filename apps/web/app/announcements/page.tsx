import type { Metadata } from 'next';
import { getStationData, requestNow } from '@/lib/station';
import { AnnouncementsView } from '@/components/station/listing';
import { PageView } from '@/components/station/page-view';

type Query = { type?: string | string[] };
const TYPES = ['group', 'usage', 'maintenance'] as const;
export const metadata: Metadata = { title: '群公告', description: '重要通知、使用提醒和维护安排。', alternates: { canonical: '/announcements' }, openGraph: { title: '群公告', description: '重要通知、使用提醒和维护安排。' } };

export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<Query> }) {
  const raw = (await searchParams).type;
  const type = (Array.isArray(raw) ? raw[0] : raw) as (typeof TYPES)[number] | undefined;
  const data = await getStationData();
  const initial = type && TYPES.includes(type) ? type : 'all';
  return <><PageView name="announcements"/><AnnouncementsView key={initial} announcements={data.announcements} software={data.software} initialType={initial} now={requestNow()}/></>;
}
