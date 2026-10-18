import { notFound } from 'next/navigation';
import { headers } from 'next/headers';
import { ApiError } from '@/lib/api';
import { getStationData, getStationSoftware } from '@/lib/station';
import { SoftwareDetail } from '@/components/station/software-detail';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const { slug } = await params; try { const { software } = await getStationSoftware(slug); return { title: software.name, description: software.summary }; } catch { return { title: '软件详情' }; } }
export default async function SoftwareDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ platform?: string; release?: string }> }) {
  const { slug } = await params;
  const query = await searchParams;
  let result;
  try { result = await Promise.all([getStationSoftware(slug), getStationData()]); }
  catch (error) { if (error instanceof ApiError && error.status === 404) notFound(); throw error; }
  const [data, station] = result;
  const ua = (await headers()).get('user-agent') || '';
  const preferred = /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop';
  const selected = query.platform || (!query.release && data.software.platforms.includes(preferred) ? preferred : undefined);
  return <SoftwareDetail key={`${slug}:${selected || ''}:${query.release || ''}`} data={data} station={station} requestedPlatform={selected} requestedRelease={query.release}/>;
}
