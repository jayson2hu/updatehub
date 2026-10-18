import { AnnouncementFeed, type AnnouncementParams } from '@/components/updates/feed';
export const metadata = { title: '公告中心', description: '集中查看软件版本更新、使用提醒和维护通知，了解影响范围与行动建议。', alternates: { canonical: '/updates' } };
export default async function UpdatesPage({searchParams}:{searchParams:Promise<AnnouncementParams>}) { return <AnnouncementFeed params={await searchParams} base="/updates"/>; }
