import type { Metadata } from 'next';
import { getStationData } from '@/lib/station';
import { categoryMeta, isCategory } from '@/lib/station-view';
import { LibraryView } from '@/components/station/listing';
import { PageView } from '@/components/station/page-view';

type Query = { cat?: string | string[]; sort?: string | string[] };
const one = (v?: string | string[]) => Array.isArray(v) ? v[0] : v;

export async function generateMetadata({ searchParams }: { searchParams: Promise<Query> }): Promise<Metadata> {
  const cat = one((await searchParams).cat);
  const title = isCategory(cat) ? `${categoryMeta[cat].label}软件` : '软件库';
  const description = '群里整理过的全部软件，点击查看下载和教程。';
  return { title, description, alternates: { canonical: '/software' }, openGraph: { title, description } };
}

export default async function SoftwarePage({ searchParams }: { searchParams: Promise<Query> }) {
  const query = await searchParams;
  const cat = one(query.cat), sort = one(query.sort);
  const data = await getStationData();
  return <><PageView name="library"/><LibraryView key={`${cat || ""}:${sort || ""}`} software={data.software} releases={data.releases} initialCat={isCategory(cat) ? cat : 'all'} initialSort={sort === 'hot' ? 'hot' : 'new'}/></>;
}
