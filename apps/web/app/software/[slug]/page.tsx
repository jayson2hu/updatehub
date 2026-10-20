import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/api';
import { siteUrl } from '@/lib/format';
import { getStationData, getStationSoftware, requestNow } from '@/lib/station';
import { adviceMeta, byPublishedDesc, detectPlatform } from '@/lib/station-view';
import { SoftwareDetail } from '@/components/station/software-detail';
import { PageView } from '@/components/station/page-view';

type Query = { platform?: string | string[]; release?: string | string[] };
const one = (v?: string | string[]) => Array.isArray(v) ? v[0] : v;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  try {
    const { software, releases } = await getStationSoftware(slug);
    const latest = [...releases].sort(byPublishedDesc)[0];
    const description = [software.summary, latest && `最新 ${latest.version}：${adviceMeta[latest.advice].label}`].filter(Boolean).join(' · ');
    const images = software.icon_url ? [{ url: software.icon_url }] : undefined;
    return { title: `${software.name} 下载与更新`, description, alternates: { canonical: `/software/${encodeURIComponent(slug)}` }, openGraph: { type: 'article', title: software.name, description, images } };
  } catch { return { title: '软件详情' }; }
}

export default async function SoftwareDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<Query> }) {
  const { slug } = await params;
  const query = await searchParams;
  const platform = one(query.platform), release = one(query.release);
  let result;
  try { result = await Promise.all([getStationSoftware(slug), getStationData()]); }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
  const [data, station] = result;
  // 设备识别与分享直达（沿用 v3 逻辑）：URL 参数优先；没有参数时按 UA 识别本机设备。
  const ua = (await headers()).get('user-agent') || '';
  const preferred = detectPlatform(ua);
  const selected = platform || (!release && data.software.platforms.includes(preferred) ? preferred : undefined);
  return <>
    <PageView name="detail"/>
    <SoftwareDetail key={`${slug}:${selected || ''}:${release || ''}`} data={data} station={station} requestedPlatform={selected} requestedRelease={release}
      detected={preferred} explicit={!!platform || !!release} siteOrigin={siteUrl().replace(/\/$/, '')} now={requestNow()}/>
  </>;
}
