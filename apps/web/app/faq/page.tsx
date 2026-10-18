import { ContentListing } from '@/components/content/listing';
import type { QueryParams } from '@/lib/public-content';
export const metadata = { title: '常见问题', description: '软件更新、系统版本选择、官方入口与关注清单的常见问题。', alternates: { canonical: '/faq' } };
export default async function FAQ({ searchParams }: { searchParams: Promise<QueryParams> }) { return <ContentListing kind="faq" params={await searchParams}/>; }
