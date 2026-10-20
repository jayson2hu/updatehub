'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Announcement, Release, Software } from '@/lib/station-types';
import { latestBySoftware, monthDay, normalizeQuery, searchAnnouncements, searchSoftware, softwarePath } from '@/lib/station-view';
import { track } from '@/lib/station-events';
import { pushSearch, recentStore, searchesStore } from '@/hooks/use-station-local';
import { useLocalStore } from '@/hooks/local-store';
import { useBack } from './chrome';
import { Highlight } from './cards';
import { WishSheet } from './sheets';
import { AdviceTag, Empty, SoftIcon, useStationUi } from './ui';

/** 每个关键词在本页只上报一次：有结果报 search，没结果报 search_miss（数据口径 §7.6）。 */
function reportSearch(done: Set<string>, term: string, hit: boolean) {
  const key = normalizeQuery(term).slice(0, 30);
  if (!key || done.has(key)) return;
  done.add(key);
  track(hit ? 'search' : 'search_miss', key);
  pushSearch(term);
}

/** 搜索（R-SEARCH）。结果在本地即时计算；URL 的 q 300ms 防抖同步；停止输入 1 秒或回车时上报关键词。 */
export function SearchView({ software, releases, announcements, hot, initialQuery }: { software: Software[]; releases: Release[]; announcements: Announcement[]; hot: string[]; initialQuery: string }) {
  const { toast } = useStationUi();
  const goBack = useBack();
  const [q, setQ] = useState(initialQuery);
  const [composing, setComposing] = useState(false);
  const [wish, setWish] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const reported = useRef(new Set<string>());
  const recentIds = useLocalStore(recentStore);
  const searches = useLocalStore(searchesStore);
  const latest = useMemo(() => latestBySoftware(releases), [releases]);
  const softById = useMemo(() => new Map(software.map(s => [s.id, s])), [software]);
  const query = q.trim();
  const softHits = useMemo(() => query ? searchSoftware(software, query) : [], [software, query]);
  const annHits = useMemo(() => query ? searchAnnouncements(announcements, query) : [], [announcements, query]);
  const found = softHits.length + annHits.length > 0;

  // 进入时聚焦，光标放到末尾（从导航搜索框跳过来时接着输入）。
  useEffect(() => { const el = input.current; if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }, []);
  useEffect(() => {
    if (composing) return;
    const timer = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (query) url.searchParams.set('q', query); else url.searchParams.delete('q');
      window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}`);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [query, composing]);
  useEffect(() => {
    if (!query || composing) return;
    const done = reported.current;
    const timer = window.setTimeout(() => reportSearch(done, query, found), 1000);
    return () => window.clearTimeout(timer);
  }, [query, found, composing]);

  const recent = recentIds.map(id => softById.get(id)).filter((s): s is Software => !!s);
  const chips = hot.slice(0, 8);
  return <div className="sv-search-page">
    <form className="sv-searchbar" role="search" onSubmit={e => { e.preventDefault(); if (composing) return; if (query) reportSearch(reported.current, query, found); input.current?.blur(); }}>
      <button type="button" className="sv-ib sv-ib--back sv-mobile-only" aria-label="返回" onClick={goBack}>‹</button>
      <label className="sv-search sv-searchbar__box">
        <span aria-hidden="true">🔍</span>
        <input ref={input} type="search" enterKeyHint="search" value={q} maxLength={60} placeholder="搜软件名、用途或公告" aria-label="搜软件名、用途或公告" onCompositionStart={() => setComposing(true)} onCompositionEnd={e => { setComposing(false); setQ(e.currentTarget.value); }} onChange={e => setQ(e.target.value)}/>
        {q && <button type="button" className="sv-search__clear" aria-label="清空搜索" onClick={() => { setQ(''); input.current?.focus(); }}>✕</button>}
      </label>
    </form>
    <div className="sv-container sv-narrow sv-search-body">
      <h1 className="sv-sr">搜索</h1>
      {!query && <>
        {chips.length > 0 && <section aria-labelledby="sv-hot-q"><div className="sv-sh"><h2 id="sv-hot-q">大家在搜</h2></div>
          <div className="sv-chips sv-chips--wrap">{chips.map((w, i) => <button key={w} type="button" className="sv-chip" onClick={() => setQ(w)}>{i < 3 ? '🔥 ' : ''}{w}</button>)}</div></section>}
        {searches.length > 0 && <section aria-labelledby="sv-my-q" className="sv-u-mt18"><div className="sv-sh"><h2 id="sv-my-q">最近搜索</h2><button type="button" onClick={() => { searchesStore.set([]); toast('已清空'); }}>清空</button></div>
          <div className="sv-chips sv-chips--wrap">{searches.map(w => <button key={w} type="button" className="sv-chip" onClick={() => setQ(w)}>{w}</button>)}</div></section>}
        <section aria-labelledby="sv-recent" className="sv-u-mt18"><div className="sv-sh"><h2 id="sv-recent">最近看过</h2>{recent.length > 0 && <button type="button" onClick={() => { recentStore.set([]); toast('已清空'); }}>清空</button>}</div>
          {recent.length ? <ul className="sv-rank">{recent.map(s => <li key={s.id}><Link href={softwarePath(s.slug)} className="sv-rank__row"><SoftIcon software={s} size="sm"/><span className="sv-u-grow"><b className="sv-u-small">{s.name}</b><span className="sv-u-xs sv-u-muted sv-u-ell sv-u-block">{s.summary}</span></span><span className="sv-u-faint" aria-hidden="true">›</span></Link></li>)}</ul>
            : <p className="sv-u-small sv-u-muted">还没有看过的软件</p>}
        </section>
      </>}
      {query && !found && <Empty icon="🔍" title={`没找到“${query}”`}>
        <p className="sv-u-small">换个关键词试试，或者告诉群主你想要什么软件</p>
        <button type="button" className="sv-btn sv-btn--soft" onClick={() => setWish(true)}>＋ 我想要这个软件</button>
      </Empty>}
      {query && found && <div className="sv-results">
        {softHits.length > 0 && <section aria-labelledby="sv-res-soft"><div className="sv-sh"><h2 id="sv-res-soft">软件 · {softHits.length}</h2></div>
          {softHits.map(({ software: s, via }) => { const r = latest.get(s.id); return <Link key={s.id} href={softwarePath(s.slug)} className="sv-result">
            <SoftIcon software={s} size="sm"/>
            <span className="sv-u-grow"><b><Highlight text={s.name} query={query}/></b><span className="sv-u-xs sv-u-muted sv-u-ell sv-u-block"><Highlight text={s.summary} query={query}/></span>{via && <span className="sv-u-xs sv-u-muted sv-u-block"><Highlight text={via} query={query}/></span>}</span>
            {r && <AdviceTag advice={r.advice}/>}
          </Link>; })}
        </section>}
        {annHits.length > 0 && <section aria-labelledby="sv-res-ann" className="sv-u-mt14"><div className="sv-sh"><h2 id="sv-res-ann">公告 · {annHits.length}</h2></div>
          {annHits.map(n => <Link key={n.id} href={`/announcements/${encodeURIComponent(n.slug)}`} className="sv-result sv-result--ann"><span className="sv-u-grow"><b><Highlight text={n.title} query={query}/></b><span className="sv-u-xs sv-u-muted sv-u-block">{monthDay(n.published_at)}</span></span></Link>)}
        </section>}
      </div>}
    </div>
    <WishSheet open={wish} onClose={() => setWish(false)} initialName={query}/>
  </div>;
}
