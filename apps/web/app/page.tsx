import { getStationData, requestNow } from '@/lib/station';
import { buildFeed, weekSummary } from '@/lib/station-view';
import { HomeView } from '@/components/station/home';
import { PageView } from '@/components/station/page-view';

export default async function HomePage() {
  const data = await getStationData();
  const now = requestNow();
  const feed = buildFeed(data);
  return <><PageView name="home"/><HomeView data={data} feed={feed} week={weekSummary(feed, data.announcements, now)} now={now}/></>;
}
