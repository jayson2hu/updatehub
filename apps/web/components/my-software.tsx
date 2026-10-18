'use client';
import Link from 'next/link';
import { ArrowRight, Bookmark, Plus } from 'lucide-react';
import { useMySoftware } from '@/hooks/use-my-software';
import type { Software } from '@/lib/types';
import { SoftwareIcon } from './software-icon';
import { SoftwareCard } from './software-card';
export function MySoftwareStrip({ software }: { software: Software[] }) {
  const { ids } = useMySoftware(); const selected = software.filter(s => ids.includes(s.id));
  return <section className="my-strip" aria-label="我的软件"><div className="my-label"><Bookmark size={19}/><strong>我的软件</strong><span className="count-pill">{ids.length}</span></div>{selected.length ? <div className="followed-chips">{selected.slice(0, 4).map(s => <Link key={s.id} href={`/software/${s.slug}`}><SoftwareIcon src={s.icon_url} name={s.name} size={22}/>{s.short_name || s.name}</Link>)}</div> : <p>把常用软件放在这里，下次不用重新找。</p>}<Link className="text-link" href={ids.length ? '/my-software' : '/software'}>{ids.length ? '查看我的软件' : '添加软件'}{ids.length ? <ArrowRight size={16}/> : <Plus size={16}/>}</Link></section>;
}
export function MySoftwareGrid({ software }: { software: Software[] }) {
  const { ids } = useMySoftware(); const selected = software.filter(s => ids.includes(s.id));
  return selected.length ? <><p className="result-count">已添加 {selected.length} 款软件</p><div className="software-grid">{selected.map(s => <SoftwareCard key={s.id} software={s}/>)}</div></> : <div className="empty-state"><Bookmark size={38}/><h2>你还没有添加常用软件</h2><p>按用途找到需要的工具，点击书签关注它。<br/>软件下线后，也会从公开清单中隐藏。</p><Link href="/software" className="button button-primary">帮我找软件 <ArrowRight size={17}/></Link></div>;
}
