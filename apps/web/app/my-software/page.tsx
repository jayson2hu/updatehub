import { Bookmark } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/server-api';
import type { Software, Paginated } from '@/lib/types';
import { MySoftwareGrid } from '@/components/my-software';
import { MyUpdates } from '@/components/updates/my-updates';
import { FollowStorageNotice } from '@/components/follow-storage-notice';
export const metadata = { title:'我的关注', robots:{index:false,follow:true} };
export default async function MySoftwarePage(){
  let page=1; let all:Software[]=[]; let total=0;
  do { const data=await api<Paginated<Software>>(`/software?page_size=100&page=${page}`); all=all.concat(data.items); total=data.total; page++; } while(all.length<total && page<101);
  return <div className="page-container following-page"><div className="page-heading"><span className="page-kicker"><Bookmark size={16}/>只看与你有关的变化</span><h1>我的关注</h1><p>你关注的软件，最新公告集中在这里。</p><FollowStorageNotice/></div><MyUpdates/><section className="followed-software-management"><div className="section-heading"><div><h2>管理关注的软件</h2></div><Link href="/software" className="button button-secondary">添加更多关注</Link></div><MySoftwareGrid software={all}/></section></div>;
}
