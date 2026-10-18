import { getStationData } from '@/lib/station';
import { StationListing } from '@/components/station/listing';
export default async function HomePage() { return <StationListing data={await getStationData()}/>; }
