import type { Metadata } from 'next';
import { getStationData } from '@/lib/station';
import { MeView } from '@/components/station/me';
import { PageView } from '@/components/station/page-view';

export const metadata: Metadata = { title: '我的', description: '收藏、同步码、常用设备和反馈记录，都保存在这台设备上。', robots: { index: false, follow: false } };

export default async function MePage() {
  const data = await getStationData();
  return <><PageView name="me"/><MeView software={data.software} releases={data.releases}/></>;
}
