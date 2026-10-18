import { ContentDetail } from '@/components/content/detail';
import { getContent } from '@/lib/public-content';
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) { const item = await getContent('faq', (await params).slug); return { title: item.title, description: item.summary || item.content.slice(0, 160), alternates: { canonical: `/faq/${item.slug}` }, robots: item.is_demo ? { index: false, follow: true } : undefined }; }
export default async function FAQ({ params }: { params: Promise<{ slug: string }> }) { return <ContentDetail kind="faq" slug={(await params).slug}/>; }
