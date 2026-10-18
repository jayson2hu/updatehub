import { notFound, redirect } from 'next/navigation';
import { isDesignVariant } from '@/lib/design-options';
import { getLabDesign } from '@/lib/design-lab';
import { getStationData } from '@/lib/station';
import { DesignPreview } from '@/components/design-lab/preview';
export async function generateMetadata({params}:{params:Promise<{design:string}>}) {const {design}=await params;const option=getLabDesign(design);return {title:option ? `${option.id} ${option.name} · 设计预览` : '设计预览',robots:{index:false,follow:false}};}

// Retired previews keep their previously shared software/device/version links usable.
export default async function Page({ params, searchParams }: { params: Promise<{ design: string; segments?: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { design, segments = [] } = await params;
  const option = getLabDesign(design);
  const input = await searchParams;
  if (option) {
    const data = await getStationData();
    const section = segments.length === 0 ? 'home' : segments.length === 1 && segments[0] === 'software' ? 'software' : segments.length === 2 && segments[0] === 'software' && data.software.some(s => s.slug === segments[1]) ? 'detail' : segments.length === 1 && segments[0] === 'announcements' ? 'announcements' : segments.length === 2 && segments[0] === 'announcements' && data.announcements.some(n => n.slug === segments[1]) ? 'announcement' : null;
    if (!section) notFound();
    return <DesignPreview design={option} data={data} section={section} slug={segments[1]} initialPlatform={typeof input.platform === 'string' ? input.platform : undefined} initialRelease={typeof input.release === 'string' ? input.release : undefined} capture={input.capture === '1'}/>;
  }
  if (!isDesignVariant(design)) notFound();
  const valid = !segments.length || (segments.length === 1 && ['software', 'announcements'].includes(segments[0])) || (segments.length === 2 && ['software', 'announcements', 'promo'].includes(segments[0]));
  if (!valid) notFound();
  const query = new URLSearchParams();
  for (const key of ['platform', 'release']) if (typeof input[key] === 'string') query.set(key, input[key]);
  redirect(`/${segments.map(encodeURIComponent).join('/')}${query.size ? `?${query}` : ''}`);
}
