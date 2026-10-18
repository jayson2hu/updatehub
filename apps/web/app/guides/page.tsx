import { ContentListing } from '@/components/content/listing';
import type { QueryParams } from '@/lib/public-content';
export const metadata = { title: '使用指南', description: '软件安装、版本核对与更新操作的实用指南。', alternates: { canonical: '/guides' } };
export default async function Guides({ searchParams }: { searchParams: Promise<QueryParams> }) { return <ContentListing kind="guide" params={await searchParams}/>; }
