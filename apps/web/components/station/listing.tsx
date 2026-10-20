'use client';
import { useMemo, useState } from 'react';
import type { Announcement, Category, Release, Software } from '@/lib/station-types';
import { categoryMeta, categoryOrder, latestBySoftware, sortAnnouncements } from '@/lib/station-view';
import { AnnCard, SoftCard } from './cards';
import { WishSheet } from './sheets';
import { Empty } from './ui';

/** 用 replaceState 把筛选写回 URL，刷新或分享后保持（不新增历史记录）。 */
function writeQuery(values: Record<string, string>) {
  const url = new URL(window.location.href);
  for (const [k, v] of Object.entries(values)) { if (v) url.searchParams.set(k, v); else url.searchParams.delete(k); }
  window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
}

/* ================= 软件库（R-LIB） ================= */
export type LibrarySort = 'new' | 'hot';
export function LibraryView({ software, releases, initialCat, initialSort }: { software: Software[]; releases: Release[]; initialCat: Category | 'all'; initialSort: LibrarySort }) {
  const [cat, setCat] = useState(initialCat);
  const [sort, setSort] = useState(initialSort);
  const [wish, setWish] = useState(false);
  const latest = useMemo(() => latestBySoftware(releases), [releases]);
  const list = useMemo(() => software
    .filter(s => s.published !== false && (cat === 'all' || s.category === cat))
    .sort((a, b) => sort === 'hot' ? b.view_count - a.view_count : (latest.get(b.id)?.published_at || '').localeCompare(latest.get(a.id)?.published_at || '')), [software, cat, sort, latest]);
  const pickCat = (c: Category | 'all') => { setCat(c); writeQuery({ cat: c === 'all' ? '' : c }); };
  const pickSort = (s: LibrarySort) => { setSort(s); writeQuery({ sort: s === 'new' ? '' : s }); };
  return <div className="sv-container sv-library">
    <header className="sv-page-head sv-desk-only"><h1>软件库</h1><p>群里整理过的全部软件，点击查看下载和教程。</p></header>
    <div className="sv-chips" role="group" aria-label="分类">
      <button type="button" className="sv-chip" aria-pressed={cat === 'all'} onClick={() => pickCat('all')}><span aria-hidden="true">🧩</span> 全部</button>
      {categoryOrder.map(c => <button key={c} type="button" className="sv-chip" aria-pressed={cat === c} onClick={() => pickCat(c)}><span aria-hidden="true">{categoryMeta[c].icon}</span> {categoryMeta[c].label}</button>)}
    </div>
    <div className="sv-sortbar">
      <span className="sv-u-muted" aria-live="polite">{list.length} 款软件</span>
      <span className="sv-u-grow"/>
      <span id="sv-sort-label">排序：</span>
      <div className="sv-sortbar__opts" role="group" aria-labelledby="sv-sort-label">
        <button type="button" className="sv-sort" aria-pressed={sort === 'new'} onClick={() => pickSort('new')}>最近更新</button>
        <button type="button" className="sv-sort" aria-pressed={sort === 'hot'} onClick={() => pickSort('hot')}>最多人看</button>
      </div>
    </div>
    {list.length ? <div className="sv-lib-grid">{list.map(s => <SoftCard key={s.id} software={s} latest={latest.get(s.id)}/>)}</div>
      : <Empty icon="📭" title="这个分类还没有软件"><button type="button" className="sv-btn sv-btn--soft" onClick={() => setWish(true)}>＋ 我想要这个软件</button></Empty>}
    <WishSheet open={wish} onClose={() => setWish(false)}/>
  </div>;
}

/* ================= 公告列表（R-ANN-01） ================= */
type AnnType = 'all' | Announcement['category'];
const ANN_TYPES: [AnnType, string][] = [['all', '全部'], ['group', '群公告'], ['usage', '使用提醒'], ['maintenance', '维护通知']];
export function AnnouncementsView({ announcements, software, initialType, now }: { announcements: Announcement[]; software: Software[]; initialType: AnnType; now: number }) {
  const [type, setType] = useState<AnnType>(initialType);
  const [limit, setLimit] = useState(20);
  const list = useMemo(() => sortAnnouncements(announcements, now).filter(n => type === 'all' || n.category === type), [announcements, type, now]);
  return <div className="sv-container sv-narrow">
    <header className="sv-page-head sv-desk-only"><h1>群公告</h1><p>重要通知、使用提醒和维护安排。</p></header>
    <div className="sv-chips sv-u-mb12" role="group" aria-label="公告类型">{ANN_TYPES.map(([k, label]) => <button key={k} type="button" className="sv-chip" aria-pressed={type === k} onClick={() => { setType(k); setLimit(20); writeQuery({ type: k === 'all' ? '' : k }); }}>{label}</button>)}</div>
    {list.length ? <>
      {list.slice(0, limit).map(n => <AnnCard key={n.id} notice={n} now={now} software={software}/>)}
      {list.length > limit ? <button type="button" className="sv-btn sv-btn--ghost sv-btn--block" onClick={() => setLimit(v => v + 20)}>加载更多</button> : <p className="sv-end">已结束的公告会保留，方便查看之前的说明</p>}
    </> : <Empty icon="📭" title="暂时没有这类公告"/>}
  </div>;
}
