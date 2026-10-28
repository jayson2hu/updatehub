'use client';
import Link from 'next/link';
import type { Announcement, Release, Software } from '@/lib/station-types';
import { allPlatforms, isExpired } from '@/lib/station';
import { adviceMeta, announcementTypes, annTone, annTypeTone, categoryMeta, feedbackRate, findRanges, formatCount, isPinnedNow, monthDay, platformEmoji, platformFull, platformShort, softwarePath, type FeedEntry } from '@/lib/station-view';
import { favoritesStore, toggleFavorite } from '@/hooks/use-station-local';
import { useLocalStore } from '@/hooks/local-store';
import { AdviceTag, Dot, Empty, SoftIcon, useStationUi } from './ui';

/** 关键词高亮：按文本节点拆分，不拼接 HTML，避免注入（R-SEARCH-04）。 */
export function Highlight({ text, query }: { text: string; query: string }) {
  const ranges = findRanges(text, query);
  if (!ranges.length) return <>{text}</>;
  const out: React.ReactNode[] = []; let at = 0;
  ranges.forEach(([start, end], i) => { if (start > at) out.push(text.slice(at, start)); out.push(<mark key={i}>{text.slice(start, end)}</mark>); at = end; });
  if (at < text.length) out.push(text.slice(at));
  return <>{out}</>;
}

/* ---------- 更新卡（R-HOME-07）：同一软件一张卡，各设备分别标出 ---------- */
export function ReleaseCard({ entry, isNew }: { entry: FeedEntry; isNew: boolean }) {
  const { software, release, items } = entry;
  const rate = feedbackRate(release);
  const sameVersion = items.every(i => i.release.version === items[0].release.version);
  const mixedAdvice = items.some(i => i.release.advice !== items[0].release.advice);
  const main = items.find(i => i.release === release) || items[0];
  return <Link className={`sv-release-card${isNew ? ' is-new' : ''}`} href={softwarePath(software.slug, main.platform, entry.current ? undefined : release.id)}>
    <span className="sv-release-card__head">
      <SoftIcon software={software}/>
      <span className="sv-u-grow">
        <span className="sv-release-card__title"><b className="sv-u-ell">{software.name}</b>{software.is_demo && <span className="sv-demo">示例</span>}{isNew && <Dot/>}<span className="sv-release-card__tag"><AdviceTag advice={release.advice}/></span></span>
        {sameVersion && <span className="sv-release-card__ver sv-mono">{release.previous_version && <><span className="sv-u-faint">{release.previous_version}</span> → </>}<b>{release.version}</b></span>}
      </span>
    </span>
    {release.summary && <span className="sv-release-card__sum">{release.summary}</span>}
    <span className="sv-release-card__foot">
      {items.map(({ platform, release: r }) => <span key={platform} className={`sv-mini${mixedAdvice ? ` sv-mini--${adviceMeta[r.advice].tone}` : ''}`} title={platformFull[platform]}>
        <span aria-hidden="true">{platformEmoji[platform]}</span> {platformShort[platform]}{!sameVersion && <span className="sv-mono"> {r.version}</span>}{mixedAdvice && ` · ${adviceMeta[r.advice].label}`}
      </span>)}
      <span className="sv-release-card__stat">👍 {rate.enough ? `${rate.pct}% 能用` : '反馈较少'}{software.view_count > 0 && ` · ${formatCount(software.view_count)} 人看过`}</span>
    </span>
  </Link>;
}

/* ---------- 收藏按钮 ---------- */
export function useFavorite(id: string) {
  const { latest, toast } = useStationUi();
  const favorites = useLocalStore(favoritesStore);
  const on = favorites.includes(id);
  const toggle = () => { const now = toggleFavorite(id, latest); toast(now ? '已收藏，有新版本会提醒你' : '已取消收藏'); };
  return { on, toggle };
}
export function FavButton({ id, className = 'sv-btn--sm' }: { id: string; className?: string }) {
  const { on, toggle } = useFavorite(id);
  return <button type="button" className={`sv-btn ${on ? 'sv-btn--soft' : 'sv-btn--ghost'} ${className}`} aria-pressed={on} onClick={toggle}>{on ? '★ 已收藏' : '☆ 收藏'}</button>;
}

/* ---------- 软件库卡（R-LIB-03）：整卡是链接，星标是独立按钮 ---------- */
export function SoftCard({ software, latest }: { software: Software; latest?: Release }) {
  const { on, toggle } = useFavorite(software.id);
  const devices = allPlatforms.filter(p => software.platforms.includes(p));
  return <article className="sv-soft-card">
    <button type="button" className="sv-soft-card__star" aria-pressed={on} aria-label={`收藏${software.name}`} onClick={toggle}><span aria-hidden="true">{on ? '★' : '☆'}</span></button>
    <SoftIcon software={software}/>
    <Link href={softwarePath(software.slug)} className="sv-soft-card__name sv-u-stretch">{software.name}</Link>{software.is_demo && <span className="sv-demo">示例</span>}
    <p className="sv-soft-card__desc">{software.summary}</p>
    <p className="sv-soft-card__devs" aria-label={`支持：${devices.map(p => platformFull[p]).join('、')}`}>{devices.map(p => <span key={p} title={platformFull[p]} aria-hidden="true">{platformEmoji[p]}</span>)}</p>
    {latest && <p className="sv-soft-card__ver"><span className="sv-mono">{latest.version}</span><AdviceTag advice={latest.advice}/></p>}
  </article>;
}

/* ---------- 公告卡（R-ANN-02）与首页横滑卡 ---------- */
export function AnnCard({ notice, now, software = [], query }: { notice: Announcement; now: number; software?: Software[]; query?: string }) {
  const ended = isExpired(notice, now);
  const related = software.filter(s => notice.software_ids.includes(s.id));
  return <Link href={`/announcements/${encodeURIComponent(notice.slug)}`} className={`sv-ann-card sv-ann-card--${annTone(notice, now)}`}>
    <span className="sv-ann-card__meta">
      {isPinnedNow(notice, now) && <span className="sv-tag sv-tag--gold">📌 置顶</span>}
      <span className={`sv-tag sv-tag--${annTypeTone(notice)}`}>{notice.importance !== 'normal' ? '重要' : announcementTypes[notice.category]}</span>
      {ended && <span className="sv-tag sv-tag--gray">已结束</span>}
      <span className="sv-ann-card__date">{monthDay(notice.published_at)}</span>
    </span>
    <b className="sv-ann-card__title">{query ? <Highlight text={notice.title} query={query}/> : notice.title}</b>
    {notice.summary && <span className="sv-ann-card__sum">{query ? <Highlight text={notice.summary} query={query}/> : notice.summary}</span>}
    {related.length > 0 && <span className="sv-ann-card__foot">{related.map(s => <span key={s.id} className="sv-mini">{s.name}</span>)}</span>}
  </Link>;
}
export function AnnMini({ notice, now }: { notice: Announcement; now: number }) {
  const pinned = isPinnedNow(notice, now);
  return <Link href={`/announcements/${encodeURIComponent(notice.slug)}`} className={`sv-ann-mini${pinned ? ' is-pin' : ''}`}>
    <span className="sv-ann-card__meta">
      {pinned && <span className="sv-tag sv-tag--gold">📌 置顶</span>}
      <span className={`sv-tag sv-tag--${annTypeTone(notice)}`}>{notice.importance !== 'normal' ? '重要' : announcementTypes[notice.category]}</span>
      <span className="sv-ann-card__date">{monthDay(notice.published_at)}</span>
    </span>
    <b className="sv-ann-mini__title">{notice.title}</b>
    {notice.summary && <span className="sv-ann-mini__sum">{notice.summary}</span>}
  </Link>;
}

/* ---------- 收藏更新横滑卡、相似卡 ---------- */
export function FavUpdateCard({ software, release }: { software: Software; release: Release }) {
  return <Link href={softwarePath(software.slug, release.platform)} className="sv-fav-card">
    <Dot/>
    <SoftIcon software={software} size="sm"/>
    <b className="sv-fav-card__name sv-u-ell">{software.name}</b>
    <span className="sv-mono sv-u-xs sv-u-muted">{release.previous_version ? `${release.previous_version} → ` : ''}{release.version}</span>
    <span><AdviceTag advice={release.advice}/></span>
  </Link>;
}
export function SimCard({ software, release }: { software: Software; release?: Release }) {
  return <Link href={softwarePath(software.slug)} className="sv-sim-card">
    <SoftIcon software={software} size="sm"/>
    <b className="sv-sim-card__name sv-u-ell">{software.name}</b>
    <span className="sv-mono sv-u-xs sv-u-muted">{release?.version || categoryMeta[software.category]?.label}</span>
  </Link>;
}

/* ---------- 本周热门（R-HOME-08） ---------- */
export function RankList({ items }: { items: { software: Software; views: number; release?: Release }[] }) {
  return <ol className="sv-rank">{items.map(({ software, views, release }, i) => <li key={software.id}>
    <Link href={softwarePath(software.slug)} className="sv-rank__row">
      <i className={`sv-rank__no sv-rank__no--${i + 1}`} aria-label={`第 ${i + 1} 名`}>{i + 1}</i>
      <SoftIcon software={software} size="sm"/>
      <span className="sv-u-grow"><b className="sv-u-ell sv-rank__name">{software.name}</b><span className="sv-u-xs sv-u-muted">{formatCount(views)} 人看过</span></span>
      {release && <AdviceTag advice={release.advice}/>}
    </Link>
  </li>)}</ol>;
}

/* ---------- 收藏列表（R-ME-02、R-HOME-09） ---------- */
export function FavList({ items, newIds, max }: { items: { software: Software; release?: Release }[]; newIds: string[]; max?: number }) {
  if (!items.length) return <Empty icon="☆" title="还没有收藏"><p className="sv-u-xs">在软件页点「☆ 收藏」，有新版本时会提醒你</p></Empty>;
  return <ul className="sv-favlist">{items.slice(0, max).map(({ software, release }) => {
    const isNew = newIds.includes(software.id);
    return <li key={software.id} className="sv-favlist__row">
      <SoftIcon software={software} size="sm"/>
      <Link href={softwarePath(software.slug, release?.platform)} className="sv-u-grow sv-favlist__main">
        <b className="sv-u-small">{software.name}</b>{software.is_demo && <span className="sv-demo">示例</span>}{isNew && <Dot/>}
        <span className="sv-u-xs sv-u-muted sv-favlist__meta">{release ? <><span className="sv-mono">{release.version}</span> · {monthDay(release.published_at)} · <AdviceLabel release={release}/></> : '暂无版本'}</span>
      </Link>
      <Link href={softwarePath(software.slug, release?.platform)} className={`sv-btn sv-btn--sm ${isNew ? 'sv-btn--primary' : 'sv-btn--ghost'}`} tabIndex={-1} aria-hidden="true">{isNew ? '看新版' : '查看'}</Link>
    </li>;
  })}</ul>;
}
function AdviceLabel({ release }: { release: Release }) { return <>{{ recommended: '建议更新', wait: '可以等等', hold: '先别更新', optional: '可选更新' }[release.advice]}</>; }
