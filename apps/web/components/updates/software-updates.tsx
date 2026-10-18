import Link from 'next/link';
import { ArrowRight, Megaphone } from 'lucide-react';
import { api } from '@/lib/server-api';
import type { Paginated, ReleaseUpdate } from '@/lib/types';
import { announcementDate, announcementKinds } from '@/lib/format';
export async function SoftwareUpdates({slug,id}:{slug:string;id:string}){
  const data=await api<Paginated<ReleaseUpdate>>(`/software/${encodeURIComponent(slug)}/updates?page_size=3`);
  return <section id="software-announcements" className="content-section software-announcements"><div className="section-heading"><h2><Megaphone size={19}/>相关公告</h2>{data.total>0&&<Link href={`/updates?software_id=${id}`} className="text-link">全部 {data.total} 条 <ArrowRight size={14}/></Link>}</div>{data.items.length?data.items.map(u=><Link className="software-announcement-row" key={u.id} href={`/update/${u.slug}`}><span><small>{announcementKinds[u.kind]}{u.is_demo?' · 演示公告':''}</small><strong>{u.title}</strong></span><time>{announcementDate(u.published_at)}</time></Link>):<p>这款软件暂时没有公开公告。</p>}</section>;
}
