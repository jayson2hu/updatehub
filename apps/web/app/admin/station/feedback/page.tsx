import { FeedbackAdmin } from '@/components/station-admin/engagement';
export default async function Page({ searchParams }: { searchParams: Promise<{ release?: string }> }) { return <FeedbackAdmin releaseId={(await searchParams).release}/>; }
