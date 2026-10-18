import { SoftwareEditor } from "@/components/station-admin/software-editor";
export default async function Page({params}:{params:Promise<{id:string}>}){const {id}=await params;return <SoftwareEditor id={id}/>;}
