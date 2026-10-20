'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import type { Release, Software } from '@/lib/station-types';
import { allPlatforms } from '@/lib/station';
import { latestBySoftware, latestMarkers, platformEmoji, platformFull, platformShort, wishStatusLabel } from '@/lib/station-view';
import { deviceStore, favoritesStore, feedbackStore, markSeen, recentStore, remindStore, syncStore, syncFingerprint, useNewFavorites, wishesStore } from '@/hooks/use-station-local';
import { useLocalStore } from '@/hooks/local-store';
import { FavList, SimCard } from './cards';
import { formatSyncCode, SyncSheet, WishSheet } from './sheets';
import { useStationUi } from './ui';

/** 我的（R-ME）：全部数据只在本机，访客不用注册。 */
export function MeView({ software, releases }: { software: Software[]; releases: Release[] }) {
  const { settings, toast } = useStationUi();
  const markers = useMemo(() => latestMarkers(releases), [releases]);
  const latest = useMemo(() => latestBySoftware(releases), [releases]);
  const softById = useMemo(() => new Map(software.map(s => [s.id, s])), [software]);
  const favorites = useLocalStore(favoritesStore);
  const recent = useLocalStore(recentStore);
  const feedback = useLocalStore(feedbackStore);
  const wishes = useLocalStore(wishesStore);
  const device = useLocalStore(deviceStore);
  const remind = useLocalStore(remindStore);
  const sync = useLocalStore(syncStore);
  const newIds = useNewFavorites(markers);
  const [sheet, setSheet] = useState<null | { kind: 'sync'; mode: 'gen' | 'in'; auto: boolean } | { kind: 'wish' }>(null);
  const [openedAt] = useState(() => Date.now());
  useEffect(() => {
    let active = true;
    Promise.allSettled(wishesStore.get().filter(w => w.id).map(async w => ({ id: w.id, result: await api<{ status: string; votes: number; software_slug: string | null }>(`/station/wishes/${w.id}`) }))).then(results => {
      if (!active) return;
      const updates = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
      if (updates.length) wishesStore.set(prev => prev.map(w => ({ ...w, ...updates.find(u => u.id === w.id)?.result, id: w.id })));
    });
    return () => { active = false; };
  }, []);

  const favItems = favorites.map(id => softById.get(id)).filter((s): s is Software => !!s).map(s => ({ software: s, release: latest.get(s.id) }));
  favItems.sort((a, b) => Number(newIds.includes(b.software.id)) - Number(newIds.includes(a.software.id)));
  const recentItems = recent.map(id => softById.get(id)).filter((s): s is Software => !!s);
  const syncDays = sync ? Math.ceil((new Date(sync.expiresAt).getTime() - openedAt) / 86400000) : 0;
  const openSync = (mode: 'gen' | 'in') => setSheet({ kind: 'sync', mode, auto: mode === 'gen' });

  return <div className="sv-me">
    <div className="sv-me__top">
      <section className="sv-me-head" aria-labelledby="sv-me-title">
        <span className="sv-me-head__av" aria-hidden="true">🙂</span>
        <div className="sv-u-grow">
          <h1 id="sv-me-title" className="sv-me-head__name">访客</h1>
          <p className="sv-u-xs sv-me-head__sub">不用注册 · 收藏保存在这台<span className="sv-mobile-only">手机</span><span className="sv-desk-only">电脑</span>上</p>
        </div>
        <button type="button" className="sv-btn sv-btn--sm sv-me-head__sync" onClick={() => openSync('gen')}>同步码</button>
      </section>
      <dl className="sv-me-stats">
        <div><dt>收藏</dt><dd>{favorites.length}</dd></div>
        <div><dt>看过</dt><dd>{recent.length}</dd></div>
        <div><dt>反馈</dt><dd>{feedback.length}</dd></div>
      </dl>
    </div>

    <div className="sv-me__grid">
      <section className="sv-card" aria-labelledby="sv-me-fav">
        <div className="sv-sh"><h2 id="sv-me-fav">⭐ 我的收藏</h2>{newIds.length > 0 && <button type="button" onClick={() => { markSeen(newIds, markers); toast('已全部标为已读'); }}>全部已读</button>}</div>
        <FavList items={favItems} newIds={newIds}/>
      </section>

      <section className="sv-card sv-sync-card" aria-labelledby="sv-me-sync">
        <div className="sv-sh"><h2 id="sv-me-sync">🔄 换手机也能保留收藏</h2></div>
        <p className="sv-u-small sv-u-muted">不用注册。生成一个同步码，在新手机的“我的”页面输入，收藏就回来了。</p>
        <div className="sv-u-row sv-u-mt12">
          <button type="button" className="sv-btn sv-btn--primary sv-u-grow" onClick={() => openSync('gen')}>生成同步码</button>
          <button type="button" className="sv-btn sv-btn--ghost sv-u-grow" onClick={() => openSync('in')}>输入同步码</button>
        </div>
        {sync && syncDays > 0 && sync.fingerprint === syncFingerprint(favorites, device) && <p className="sv-u-xs sv-u-muted sv-u-mt8">当前同步码 <b className="sv-mono">{formatSyncCode(sync.code)}</b> · 还剩 {syncDays} 天</p>}
      </section>

      <section className="sv-card" aria-labelledby="sv-me-dev">
        <div className="sv-sh"><h2 id="sv-me-dev">📱 我的常用设备</h2></div>
        <p className="sv-u-xs sv-u-muted sv-u-mb8">打开软件页时，默认显示这个设备的下载</p>
        <div className="sv-chips sv-chips--wrap" role="group" aria-label="常用设备">
          <button type="button" className="sv-chip" aria-pressed={device === ''} onClick={() => { deviceStore.set(''); toast('已改为自动识别'); }}>自动识别</button>
          {allPlatforms.map(p => <button key={p} type="button" className="sv-chip" aria-pressed={device === p} onClick={() => { deviceStore.set(p); toast('已设为常用设备'); }}><span aria-hidden="true">{platformEmoji[p]}</span> {platformFull[p]}</button>)}
        </div>
      </section>

      <section className="sv-card" aria-labelledby="sv-me-remind">
        <div className="sv-sh"><h2 id="sv-me-remind">🔔 更新提醒</h2></div>
        <div className="sv-setrow">
          <span id="sv-remind-1">打开网站时，提醒收藏的软件有新版<span className="sv-u-xs sv-u-muted sv-u-block">在首页和“我的”显示红点</span></span>
          <button type="button" className="sv-switch" role="switch" aria-checked={remind} aria-labelledby="sv-remind-1" onClick={() => remindStore.set(!remind)}/>
        </div>
        <div className="sv-setrow">
          <span id="sv-remind-2">微信 / 邮件推送新版本<span className="sv-u-xs sv-u-muted sv-u-block">需要登录 · 规划中</span></span>
          <button type="button" className="sv-switch" role="switch" aria-checked={false} aria-disabled="true" aria-labelledby="sv-remind-2" onClick={() => toast('即将推出：开启时才需要登录')}/>
        </div>
      </section>

      {recentItems.length > 0 && <section className="sv-card" aria-labelledby="sv-me-recent">
        <div className="sv-sh"><h2 id="sv-me-recent">🕘 最近看过</h2></div>
        <div className="sv-hs sv-hs--card">{recentItems.map(s => <SimCard key={s.id} software={s} release={latest.get(s.id)}/>)}</div>
      </section>}

      <section className="sv-card" aria-labelledby="sv-me-fb">
        <div className="sv-sh"><h2 id="sv-me-fb">💬 我的反馈</h2></div>
        {feedback.length ? <ul className="sv-setlist">{feedback.map(r => <li key={r.releaseId} className="sv-setrow"><span>{r.name} <span className="sv-mono">{r.version}</span><span className="sv-u-xs sv-u-muted"> · {platformShort[r.platform] || ''}</span></span><span className={`sv-tag sv-tag--${r.verdict === 'ok' ? 'ok' : 'bad'}`}>{r.verdict === 'ok' ? '能正常用' : '有问题'}</span></li>)}</ul>
          : <p className="sv-u-small sv-u-muted">在软件页点“能正常用 / 有问题”，帮其他群友判断要不要更新。</p>}
      </section>

      <section className="sv-card" aria-labelledby="sv-me-wish">
        <div className="sv-sh"><h2 id="sv-me-wish">🙋 想要的软件</h2><button type="button" onClick={() => setSheet({ kind: 'wish' })}>＋ 提交</button></div>
        {wishes.length ? <ul className="sv-setlist">{wishes.map(w => <li key={`${w.name}-${w.at}`} className="sv-setrow"><span>{w.software_slug ? <Link className="sv-link" href={`/software/${w.software_slug}`}>{w.name}</Link> : w.name}{w.votes > 1 && <span className="sv-u-xs sv-u-muted"> · {w.votes} 人想要</span>}</span><span className={`sv-tag sv-tag--${w.status === 'added' ? 'ok' : 'gray'}`}>{wishStatusLabel(w.status)}</span></li>)}</ul>
          : <p className="sv-u-small sv-u-muted">没找到想要的软件？告诉群主，收录后会在这里显示。</p>}
      </section>

      <nav className="sv-card" aria-label="说明">
        <Link className="sv-setrow" href="/about#about">关于{settings.site_name}<span className="sv-u-faint" aria-hidden="true">›</span></Link>
        <Link className="sv-setrow" href="/about#privacy">隐私说明：不收集个人信息，反馈匿名<span className="sv-u-faint" aria-hidden="true">›</span></Link>
        <Link className="sv-setrow" href="/about#disclaimer">免责声明<span className="sv-u-faint" aria-hidden="true">›</span></Link>
      </nav>
    </div>
    <SyncSheet open={sheet?.kind === 'sync'} onClose={() => setSheet(null)} mode={sheet?.kind === 'sync' ? sheet.mode : 'gen'} autoGenerate={sheet?.kind === 'sync' && sheet.auto}/>
    <WishSheet open={sheet?.kind === 'wish'} onClose={() => setSheet(null)}/>
  </div>;
}
