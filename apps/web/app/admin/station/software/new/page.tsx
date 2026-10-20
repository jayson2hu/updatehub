import { SoftwareEditor } from "@/components/station-admin/software-editor";
export default async function Page({searchParams}:{searchParams:Promise<{name?:string;wish?:string}>}){const q=await searchParams;return <SoftwareEditor requestedName={q.name} wishId={q.wish}/>;}
