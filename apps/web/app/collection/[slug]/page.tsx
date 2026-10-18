import { ContentDetail } from '@/components/content/detail';
import { getContent } from '@/lib/public-content';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const item = await getContent('collection', (await params).slug); return { title: item.title, description: item.summary, alternates: { canonical: `/collection/${item.slug}` }, robots: item.is_demo ? { index: false, follow: true } : undefined }; }
export default async function Collection({ params }: { params: Promise<{ slug: string }> }) { return <ContentDetail kind="collection" slug={(await params).slug}/>; }
