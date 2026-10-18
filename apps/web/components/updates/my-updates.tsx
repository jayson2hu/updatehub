'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, ArrowRight } from 'lucide-react';
import { api } from '@/lib/api';
import { useMySoftware } from '@/hooks/use-my-software';
import type { Paginated, ReleaseUpdate } from '@/lib/types';
import { UpdateCard } from './update-card';
export function MyUpdates() {
  const { ids } = useMySoftware();
  const [pagination, setPagination] = useState({ids:'',page:1}); const [retry, setRetry] = useState(0);
  const idKey = ids.join(','); const page = pagination.ids === idKey ? pagination.page : 1;
  const setPage = (next: (page:number) => number) => setPagination({ids:idKey,page:next(page)});
  const requestKey = `${idKey}:${page}:${retry}`;
  const [result, setResult] = useState<{key:string;data?:Paginated<ReleaseUpdate>;error?:string}>({key:''});
  useEffect(() => {
    if (!idKey) return;
    const controller = new AbortController();
    const q = new URLSearchParams({software_ids:idKey,page:String(page),page_size:'10'});
    api<Paginated<ReleaseUpdate>>(`/updates?${q}`,{signal:controller.signal}).then(data => {if(!controller.signal.aborted)setResult({key:requestKey,data});}).catch(error => { if(!controller.signal.aborted) setResult({key:requestKey,error:error instanceof Error ? error.message : '公告暂时无法加载'}); });
    return () => controller.abort();
  }, [idKey,page,requestKey]);
  if (!ids.length) return <div className="empty-state announcement-empty"><Bell size={37}/><h2>先关注你正在使用的软件</h2><p>这里会集中展示这些软件的公告。选择一款常用软件开始关注。</p><div className="button-row"><Link href="/software" className="button button-primary">添加关注 <ArrowRight size={16}/></Link><Link href="/start" className="button button-secondary">按系统和用途选择</Link></div></div>;
  if (result.key !== requestKey) return <div role="status" aria-label="正在加载关注公告" className="followed-loading">{[1,2,3].map(i => <div key={i} className="skeleton"/>)}</div>;
  if (result.error) return <div className="empty-state"><h2>暂时无法加载关注公告</h2><p>{result.error}</p><button className="button button-primary" onClick={()=>setRetry(x=>x+1)}>重新加载</button></div>;
  const data=result.data!;
  return <><p className="followed-result">找到 {data.total} 条相关公告，按置顶和发布时间排列。</p>{data.items.length ? <div className="announcement-list">{data.items.map(u => <UpdateCard key={u.id} update={u}/>)}</div> : <div className="empty-state announcement-empty"><Bell size={34}/><h2>关注的软件暂无公开公告</h2><p>之后发布的相关公告会出现在这里。</p><Link href="/updates" className="text-link">查看全部公告 <ArrowRight size={15}/></Link></div>}{data.total>data.page_size && <nav className="pagination" aria-label="关注公告分页"><button className="button button-secondary" disabled={page===1} onClick={()=>setPage(x=>x-1)}>上一页</button><span>第 {page} 页</span><button className="button button-secondary" disabled={page*data.page_size>=data.total} onClick={()=>setPage(x=>x+1)}>下一页</button></nav>}</>;
}
