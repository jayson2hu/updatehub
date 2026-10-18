import { ReleaseEditor } from "@/components/station-admin/release-editor";
export default async function Page({searchParams}:{searchParams:Promise<{software?:string}>}){const {software}=await searchParams;return <ReleaseEditor softwareId={software}/>;}
