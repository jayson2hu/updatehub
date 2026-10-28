'use client';
import Link from 'next/link';
import { Fragment, useMemo, useState } from 'react';
import type { Platform, StationData } from '@/lib/station-types';
import { allPlatforms, isExpired } from '@/lib/station';
import { categoryMeta, categoryOrder, dayHeading, latestBySoftware, latestMarkers, monthDay, narrowEntry, platformEmoji, platformShort, sortAnnouncements, type FeedEntry } from '@/lib/station-view';
import { favoritesStore, markSeen, useNewFavorites } from '@/hooks/use-station-local';
import { useLocalStore } from '@/hooks/local-store';
import { AdSlot } from './ad-slot';
import { AnnMini, FavList, FavUpdateCard, RankList, ReleaseCard } from './cards';
import { Badge, Empty, useStationUi } from './ui';

interface Week { label: string; count: number; recommended: number; hold: number; important: number }
const PAGE = 20;

export function HomeView({ data, feed, week, now }: { data: StationData; feed: FeedEntry[]; week: Week; now: number }) {
  const { settings, toast } = useStationUi();
  const markers = useMemo(() => latestMarkers(data.releases), [data.releases]);
  const newIds = useNewFavorites(markers);
  const favorites = useLocalStore(favoritesStore);
  const [device, setDevice] = useState<'all' | Platform>('all');
  const [limit, setLimit] = useState(PAGE);
  const latest = useMemo(() => latestBySoftware(data.releases), [data.releases]);
  const notices = useMemo(() => sortAnnouncements(data.announcements, now).filter(n => !isExpired(n, now)), [data.announcements, now]);
  const softById = useMemo(() => new Map(data.software.map(s => [s.id, s])), [data.software]);
  const cats = categoryOrder.filter(c => data.software.some(s => s.category === c && s.published !== false));
  const hot = (data.stats?.hot_software || []).map(id => softById.get(id)).filter((s): s is NonNullable<typeof s> => !!s).slice(0, 5)
    .map(s => ({ software: s, views: data.stats?.software[s.id]?.views_7d || 0, release: latest.get(s.id) }));
  const favItems = favorites.map(id => softById.get(id)).filter((s): s is NonNullable<typeof s> => !!s).map(s => ({ software: s, release: latest.get(s.id) }));
  favItems.sort((a, b) => Number(newIds.includes(b.software.id)) - Number(newIds.includes(a.software.id)));

  // 有新版的收藏软件提到列表最前（只取其当前版本），其余按日期分组。
  const rows = device === 'all' ? feed : feed.flatMap(e => narrowEntry(e, device) || []);
  const pinned = rows.filter(e => e.current && newIds.includes(e.software.id));
  const rest = rows.filter(e => !pinned.includes(e));
  const ordered = [...pinned, ...rest].slice(0, limit);
  // 预先算好每张卡片前要不要插入分组标题。
  const blocks: { entry: FeedEntry; heading: string | null; fav: boolean }[] = [];
  let lastDay = '';
  ordered.forEach((entry, i) => {
    const fav = pinned.includes(entry);
    const heading = fav ? (i === 0 ? '★ 你收藏的软件有新版本' : null) : entry.day !== lastDay ? dayHeading(entry.day, now) : null;
    if (!fav) lastDay = entry.day;
    blocks.push({ entry, heading, fav });
  });
  const readAll = () => { markSeen(newIds, markers); toast('已全部标为已读'); };

  const hero = <section className="sv-hero" aria-labelledby="sv-hero-title">
    <div className="sv-hero__main">
      <p className="sv-hero__kicker">{settings.site_name} · {week.label}</p>
      <h1 id="sv-hero-title" className="sv-hero__title">{week.count ? `本周 ${week.count} 个软件更新` : '本周暂无软件更新'}</h1>
      {week.count > 0 && <p className="sv-hero__stats">
        {week.recommended > 0 && <span>✓ {week.recommended} 个建议更新</span>}
        {week.hold > 0 && <span>✕ {week.hold} 个先别更新</span>}
        {week.important > 0 && <span>📢 {week.important} 条重要公告</span>}
      </p>}
      <Link href="/search" className="sv-hero__search"><span aria-hidden="true">🔍</span> 搜软件名或用途，例如“看电视”</Link>
    </div>
    {notices.length > 0 && <div className="sv-hero__side sv-desk-only">
      <b className="sv-u-small">📌 最新公告</b>
      <ul>{notices.slice(0, 3).map(n => <li key={n.id}><Link href={`/announcements/${encodeURIComponent(n.slug)}`}><span className="sv-u-ell sv-u-grow">{n.title}</span><span className="sv-u-xs">{monthDay(n.published_at)}</span></Link></li>)}</ul>
    </div>}
  </section>;

  const feedList = <>
    <div className="sv-chips" role="group" aria-label="按设备筛选">
      <button type="button" className="sv-chip" aria-pressed={device === 'all'} onClick={() => { setDevice('all'); setLimit(PAGE); }}>全部设备</button>
      {allPlatforms.map(p => <button key={p} type="button" className="sv-chip" aria-pressed={device === p} onClick={() => { setDevice(p); setLimit(PAGE); }}><span aria-hidden="true">{platformEmoji[p]}</span> {platformShort[p]}</button>)}
    </div>
    <div className="sv-feed">
      {ordered.length === 0 && <Empty icon="📭" title="这个设备暂时没有更新"/>}
      {blocks.map(({ entry, heading, fav }, i) => {
        return <Fragment key={entry.key}>
          {heading && <p className={`sv-day${fav ? ' sv-day--fav' : ''}`}>{heading}</p>}
          <ReleaseCard entry={entry} isNew={fav}/>
          {/* 首页信息流广告：第 3 条之后（少于 3 条不显示，R-AD-01）。 */}
          {i === 2 && <AdSlot settings={settings} promotions={data.promotions} placement="home_feed" variant="feed"/>}
        </Fragment>;
      })}
      {rows.length > limit ? <button type="button" className="sv-btn sv-btn--ghost sv-btn--block" onClick={() => setLimit(v => v + PAGE)}>加载更多</button>
        : ordered.length > 0 && <p className="sv-end">没有更多了</p>}
    </div>
  </>;

  const hotCard = hot.length > 0 && <section className="sv-card" aria-labelledby="sv-hot-title"><div className="sv-sh"><h2 id="sv-hot-title">🔥 本周热门</h2></div><RankList items={hot}/></section>;

  return <div className="sv-home">
    <div className="sv-container">
      {hero}
      {notices.length > 0 && <section className="sv-sec sv-mobile-only" aria-labelledby="sv-ann-title">
        <div className="sv-sh"><h2 id="sv-ann-title">群公告</h2><Link href="/announcements">全部 ›</Link></div>
        <div className="sv-hs">{notices.map(n => <AnnMini key={n.id} notice={n} now={now}/>)}</div>
      </section>}
      {newIds.length > 0 && <section className="sv-sec sv-mobile-only" aria-labelledby="sv-favnew-title">
        <div className="sv-sh"><h2 id="sv-favnew-title">收藏的软件有更新 <Badge count={newIds.length}/></h2><button type="button" onClick={readAll}>全部已读</button></div>
        <div className="sv-hs">{newIds.map(id => { const s = softById.get(id), r = latest.get(id); return s && r ? <FavUpdateCard key={id} software={s} release={r}/> : null; })}</div>
      </section>}
      <nav className="sv-sec sv-cats" aria-label="分类">
        {cats.map(c => <Link key={c} href={`/software?cat=${c}`} className="sv-cat"><span style={{ background: categoryMeta[c].bg }} aria-hidden="true">{categoryMeta[c].icon}</span>{categoryMeta[c].label}</Link>)}
        <Link href="/software" className="sv-cat"><span style={{ background: '#EEF1F6' }} aria-hidden="true">🧩</span>全部</Link>
      </nav>
      <div className="sv-layout">
        <section className="sv-sec sv-layout__main" aria-labelledby="sv-feed-title">
          <div className="sv-sh"><h2 id="sv-feed-title" className="sv-feed-title">最新更新</h2><Link href="/software" className="sv-mobile-only">软件库 ›</Link><span className="sv-desk-only sv-u-small sv-u-muted">共 {feed.length} 条</span></div>
          {feedList}
        </section>
        <aside className="sv-aside" aria-label="侧栏">
          <section className="sv-card sv-desk-only" aria-labelledby="sv-myfav-title">
            <div className="sv-sh"><h2 id="sv-myfav-title">⭐ 我的收藏 <Badge count={newIds.length}/></h2><Link href="/me">管理 ›</Link></div>
            <FavList items={favItems} newIds={newIds} max={4}/>
          </section>
          {hotCard}
          <div className="sv-desk-only"><AdSlot settings={settings} promotions={data.promotions} placement="desktop_sidebar" variant="side"/></div>
        </aside>
      </div>
      {/* 首页底部横幅：更新列表之后、页脚之前。 */}
      <div className="sv-sec"><AdSlot settings={settings} promotions={data.promotions} placement="home_banner" variant="wide"/></div>
    </div>
  </div>;
}
