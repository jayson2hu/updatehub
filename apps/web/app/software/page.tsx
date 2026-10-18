import { getStationData } from '@/lib/station';
import { StationListing } from '@/components/station/listing';
export const metadata = { title: '软件目录' };
export default async function SoftwarePage() { return <StationListing data={await getStationData()} directory/>; }
