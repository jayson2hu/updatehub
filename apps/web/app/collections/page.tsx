import { ContentListing } from '@/components/content/listing';
import type { QueryParams } from '@/lib/public-content';
export const metadata = { title: '软件合集', description: '按开发、办公、设计和学习场景整理的软件清单。', alternates: { canonical: '/collections' } };
export default async function Collections({ searchParams }: { searchParams: Promise<QueryParams> }) { return <ContentListing kind="collection" params={await searchParams}/>; }
