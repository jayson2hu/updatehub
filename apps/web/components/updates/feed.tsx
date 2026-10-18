import Link from 'next/link';
import { ArrowRight, ArrowLeft, Megaphone, Search, Bookmark, BookOpen, ShieldCheck, SearchX, X, History, Library } from 'lucide-react';
import { api } from '@/lib/server-api';
import type { Paginated, ReleaseUpdate, Software } from '@/lib/types';
import { announcementKinds } from '@/lib/format';
import { UpdateCard } from './update-card';
import { FollowSummary } from './follow-summary';
import { SearchTracker } from '@/components/search-tracker';

export type AnnouncementParams = { q?: string | string[]; kind?: string | string[]; update_level?: string | string[]; software_id?: string | string[]; page?: string | string[]; include_historical?: string | string[] };
const value = (item: string | string[] | undefined) => Array.isArray(item) ? item[0] || '' : item || '';

async function softwareOptions() {
  const first = await api<Paginated<Software>>('/software?page_size=100');
  const items = [...first.items];
  for (let page = 2; items.length < first.total; page++) {
    const next = await api<Paginated<Software>>(`/software?page_size=100&page=${page}`);
    if (!next.items.length) break;
    items.push(...next.items);
  }
  return items;
}

export async function AnnouncementFeed({ params: raw, base = '/' }: { params: AnnouncementParams; base?: string }) {
  const params = Object.fromEntries(Object.entries(raw).map(([key,item]) => [key,value(item)]));
  const query = new URLSearchParams();
  if (params.q) query.set('q', params.q.slice(0,160));
  if (params.kind && Object.hasOwn(announcementKinds,params.kind)) query.set('kind',params.kind);
  if (['critical','recommended','optional','hold'].includes(params.update_level)) query.set('update_level',params.update_level);
  if (params.software_id) query.set('software_id',params.software_id.slice(0,36));
  if (params.include_historical==='true') query.set('include_historical','true');
  const requested = /^\d+$/.test(params.page || '') ? Number(params.page) : 1;
  query.set('page',String(Number.isSafeInteger(requested) && requested>=1 && requested<=10000 ? requested : 1));
  query.set('page_size','10');
  const [initial, software] = await Promise.all([api<Paginated<ReleaseUpdate>>(`/updates?${query}`),softwareOptions()]);
  let data=initial;
  const lastPage=Math.max(1,Math.ceil(data.total/data.page_size));
  if (data.page>lastPage) { query.set('page',String(lastPage)); data=await api<Paginated<ReleaseUpdate>>(`/updates?${query}`); }
  const selectedSoftware=software.find(item=>item.id===query.get('software_id'));
  const link=(field:string, selected:string)=> { const next=new URLSearchParams(query); next.delete('page_size'); if(field!=='page') next.delete('page'); if(selected) next.set(field,selected); else next.delete(field); return `${base}?${next}`; };
  const hasFilters=Boolean(query.get('q') || query.get('kind') || query.get('software_id') || query.get('update_level') || query.get('include_historical'));
  const hidden=(keys:string[])=>keys.map(key=>query.get(key) ? <input key={key} type="hidden" name={key} value={query.get(key)!}/> : null);

  return <div className="page-container bulletin-page bulletin-workspace">
    <header className="bulletin-intro"><div className="bulletin-heading"><h1>最新公告</h1><p>查看软件变化、更新建议与维护通知。</p></div><div className="bulletin-entry-actions"><Link href="/software" className="button button-secondary"><Library size={17}/>按软件查看</Link><Link href="/my-software" className="button button-secondary"><Bookmark size={17}/>我的关注</Link></div></header>
    <SearchTracker query={query.get('q') || ''} total={data.total} scope="updates"/><div className="bulletin-start-link"><span>第一次来？选好软件，集中查看与你有关的公告。</span><Link href="/start">新手开始</Link></div><div className="bulletin-layout"><section className="bulletin-main" aria-label="公告列表">
      <form action={base} role="search" className="bulletin-search"><Search size={19}/><label className="sr-only" htmlFor="announcement-search">搜索公告或软件</label><input key={params.q || ''} id="announcement-search" name="q" type="search" defaultValue={params.q || ''} placeholder="搜索软件名称、别名或公告内容" maxLength={160}/>{hidden(['kind','software_id','update_level','include_historical'])}<button type="submit">搜索公告</button></form>
      <div className="bulletin-toolbar"><nav className="announcement-tabs" aria-label="公告类型"><Link href={link('kind','')} className={!query.get('kind') ? 'selected' : ''}>全部公告</Link>{Object.entries(announcementKinds).map(([kind,label])=><Link key={kind} href={link('kind',kind)} className={query.get('kind')===kind ? 'selected' : ''}>{label}</Link>)}</nav></div>
      <details key={query.toString()} className="announcement-filter-panel" open={Boolean(query.get('software_id') || query.get('update_level') || query.get('include_historical'))}><summary>筛选软件与建议<span>{query.get('software_id') || query.get('update_level') || query.get('include_historical') ? '已启用筛选' : '全部软件 · 全部建议'}</span></summary><form action={base} className="announcement-filters">{hidden(['q','kind'])}<label><span>软件</span><select name="software_id" defaultValue={query.get('software_id') || ''}><option value="">全部软件</option>{software.map(item=><option key={item.id} value={item.id}>{item.short_name || item.name}</option>)}</select></label><label><span>处理建议</span><select name="update_level" aria-label="公告重要程度" defaultValue={query.get('update_level') || ''}><option value="">全部建议</option><option value="critical">尽快处理</option><option value="recommended">建议关注</option><option value="optional">按需处理</option><option value="hold">暂缓操作</option></select></label><button type="submit">筛选</button><label className="history-filter"><input type="checkbox" name="include_historical" value="true" defaultChecked={query.get('include_historical')==='true'}/><span>包含历史版本记录</span></label>{hasFilters && <Link href={base} className="clear-notices"><X size={14}/>清除筛选</Link>}</form></details>
      {selectedSoftware && <div className="selected-software-context"><div><strong>{selectedSoftware.name}</strong><span>当前记录：{selectedSoftware.latest_version || '暂未填写'}</span></div><Link href={`/software/${selectedSoftware.slug}#version-history`} className="text-link"><History size={16}/>查看版本历史</Link></div>}
      <div className="announcement-results-heading"><p>共 {data.total} 条{query.get('include_historical') ? '公告及历史记录' : '公告'}</p>{params.q && <span>搜索“{params.q.slice(0,160)}”</span>}</div>
      {data.items.some(item=>item.is_demo) && <div className="demo-notices-note"><InfoIcon/><span>带有“演示公告”标识的内容仅用于体验流程，不代表真实版本或操作建议。</span></div>}
      {data.items.length ? <div className="announcement-list">{data.items.map(item=><UpdateCard key={item.id} update={item}/>)}</div> : <div className="empty-state announcement-empty">{hasFilters ? <SearchX size={36}/> : <Megaphone size={36}/>}<h2>{hasFilters ? '没有找到匹配的公告' : '暂时还没有公开公告'}</h2><p>{hasFilters ? '尝试其他关键词，或清除筛选。历史版本也可以在软件档案中查看。' : '公告发布后会出现在这里。你也可以先查找并关注软件。'}</p><div className="button-row"><Link className="button button-primary" href={hasFilters ? base : '/software'}>{hasFilters ? '查看全部公告' : '查找软件'}</Link>{hasFilters && <Link className="button button-secondary" href={`/software${params.q ? `?q=${encodeURIComponent(params.q.slice(0,100))}` : ''}`}>查找软件档案</Link>}</div></div>}
      {data.total>data.page_size && <nav className="pagination" aria-label="公告分页">{data.page>1 && <Link href={link('page',String(data.page-1))} className="button button-secondary"><ArrowLeft size={15}/>上一页</Link>}<span>第 {data.page} / {Math.ceil(data.total/data.page_size)} 页</span>{data.page*data.page_size<data.total && <Link href={link('page',String(data.page+1))} className="button button-secondary">下一页<ArrowRight size={15}/></Link>}</nav>}
    </section><aside className="bulletin-aside"><FollowSummary/><section className="bulletin-guide"><div className="aside-heading"><BookOpen size={19}/><h2>找到适合自己的更新</h2></div><p>先选择你使用的软件，再查看当前版本与适用范围。过去的版本和建议保存在版本历史中。</p><Link href="/software">查看软件与版本 <ArrowRight size={15}/></Link><Link href="/finder" className="bulletin-task-link">只记得用途？帮我找软件</Link><Link href="/collections" className="bulletin-task-link">按场景选择软件</Link></section><section className="bulletin-trust"><ShieldCheck size={23}/><h3>通过官方渠道核对</h3><p>公告包含来源与行动建议。安装前请在官方页面确认系统和版本。</p><Link href="/help" className="text-link">常见问题与使用指南 <ArrowRight size={15}/></Link></section></aside></div>
  </div>;
}
function InfoIcon() { return <BookOpen size={17} aria-hidden="true"/>; }
