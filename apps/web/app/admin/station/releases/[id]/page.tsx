import { ReleaseEditor } from "@/components/station-admin/release-editor";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <ReleaseEditor key={id} id={id}/>;}
