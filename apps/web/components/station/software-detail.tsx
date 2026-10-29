'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { Platform, Release, Software, SoftwareData, StationData } from '@/lib/station-types';
import { castFeedback, type VoteResult } from '@/lib/station-feedback';
import { allPlatforms, getReleaseState } from '@/lib/station';
import {
  adviceMeta, backupLinks, byPublishedDesc, categoryMeta, changeKindMeta, changeKindOrder, defaultInstallTip, feedbackRate, hostOf,
  latestBySoftware, latestMarkers, monthDay, officialLink, platformEmoji, platformFull, platformShort, softwarePath,
} from '@/lib/station-view';
import { track, trackDaily } from '@/lib/station-events';
import { deviceStore, feedbackStore, markSeen, pushRecent } from '@/hooks/use-station-local';
import { useLocalStore } from '@/hooks/local-store';
import { AdSlot } from './ad-slot';
import { AnnCard, FavButton, SimCard, useFavorite } from './cards';
import { InAppBar, MobileTopbar } from './chrome';
import { QrPreview } from './qr-preview';
import { errorMessage, FeedbackSheet, ShareSheet } from './sheets';
import { AdviceTag, Empty, SoftIcon, useStationUi } from './ui';

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * 软件详情（R-DETAIL）。保留 v3 的 URL 同步与分享直达：
 * - 初始设备 / 版本来自服务端解析的 ?platform=&release=（不合法时回落）；
 * - 切换设备 / 版本用 replaceState 写回 URL，不新增历史；popstate 时按 URL 恢复。
 * 默认设备优先级：URL 参数 > 我的常用设备 > UA 识别 > 第一个支持的设备（R-GLOBAL-05）。
 */
export function SoftwareDetail({ data, station, requestedPlatform, requestedRelease, detected, explicit, siteOrigin, now }: {
  data: SoftwareData; station: StationData; requestedPlatform?: string; requestedRelease?: string; detected: Platform; explicit: boolean; siteOrigin: string; now: number;
}) {
  const { software } = data;
  const { inApp, settings, openGuide, copy, toast } = useStationUi();
  const ordered = useMemo(() => data.releases.filter(r => r.published !== false).sort(byPublishedDesc), [data.releases]);
  const supported = useMemo(() => allPlatforms.filter(p => software.platforms.includes(p)), [software.platforms]);
  const matched = ordered.find(r => r.id === requestedRelease && (!requestedPlatform || r.platform === requestedPlatform));
  const fallback: Platform = matched?.platform || (supported.includes(requestedPlatform as Platform) ? requestedPlatform as Platform : supported[0] || 'android');

  // userPick 为 null 表示"自动"：此时常用设备（本机存储，水合后才可读）可以覆盖 UA 识别结果。
  const [userPick, setUserPick] = useState<Platform | null>(explicit ? fallback : null);
  const [releaseId, setReleaseId] = useState<string | undefined>(matched?.id);
  const [sheet, setSheet] = useState<'share' | 'issue' | null>(null);
  const [announce, setAnnounce] = useState('');
  // 本次会话新投的票（服务端数据要刷新后才包含），用于在本地 +1 显示。
  const myDevice = useLocalStore(deviceStore);
  const platform: Platform = userPick ?? (myDevice && supported.includes(myDevice) ? myDevice : fallback);
  const auto = userPick === null;

  useEffect(() => {
    function syncLocation() {
      const query = new URLSearchParams(window.location.search);
      const id = query.get('release'); const p = query.get('platform');
      const selected = data.releases.find(r => r.id === id && (!p || r.platform === p));
      setUserPick(selected?.platform || (supported.includes(p as Platform) ? p as Platform : null));
      setReleaseId(selected?.id);
    }
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, [data.releases, supported]);

  // 浏览记录（R-DETAIL-22）：最近看过、标记已读、当天去重上报 sw_view。
  useEffect(() => {
    pushRecent(software.id);
    markSeen([software.id], latestMarkers(data.releases));
    trackDaily('sw_view', software.id);
  }, [software.id, data.releases]);

  function select(p: Platform, selected?: Release) {
    setUserPick(p); setReleaseId(selected?.id);
    setAnnounce(`已切换到${platformFull[p]}${selected ? ` ${selected.version}` : '最新版本'}`);
    const url = new URL(window.location.href);
    url.searchParams.set('platform', p);
    if (selected) url.searchParams.set('release', selected.id); else url.searchParams.delete('release');
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  }

  const list = ordered.filter(r => r.platform === platform);
  const latest = list[0];
  async function openIssue() {
    if (!latest) return;
    try {
      if (!feedbackStore.get().some(r => r.releaseId === latest.id && r.verdict === 'issue')) await castFeedback(software, latest, 'issue');
      setSheet('issue');
    } catch (error) { toast(errorMessage(error)); }
  }
  const release = list.find(r => r.id === releaseId) || latest;
  const historical = !!release && !!latest && release.id !== latest.id;
  const stable = latest?.advice === 'hold' && latest.stable_release_id ? list.find(r => r.id === latest.stable_release_id) : undefined;
  const shareUrl = `${siteOrigin}${softwarePath(software.slug, platform, historical ? release?.id : undefined)}`;
  const cat = categoryMeta[software.category] || categoryMeta.other;

  // 下载点击：小红书内改为打开引导（R-GLOBAL-06），否则上报 dl_copy（下载点击口径 §7.5）。
  function onDownload(event: React.MouseEvent, id: string) {
    if (inApp === 'xhs' || (inApp === 'wechat' && settings.wechat_inapp_hint === true)) { event.preventDefault(); openGuide(); return; }
    track('dl_copy', id);
  }
  function chooseVersion(r: Release) {
    select(platform, r.id === latest?.id ? undefined : r);
    if (window.matchMedia('(max-width: 1023px)').matches) document.getElementById('sv-download')?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
  }

  const favorite = useFavorite(software.id);
  const related = data.announcements.filter(n => n.published !== false);
  const sims = useMemo(() => {
    const others = station.software.filter(s => s.id !== software.id && s.published !== false);
    const same = others.filter(s => s.category === software.category);
    const rest = others.filter(s => s.category !== software.category).sort((a, b) => b.view_count - a.view_count);
    return [...same, ...rest].slice(0, 4);
  }, [station.software, software.id, software.category]);
  const simLatest = useMemo(() => latestBySoftware(station.releases), [station.releases]);
  const downloadProps = { software, release, latest, stable, historical, platform, onDownload, onSelectStable: () => stable && select(platform, stable) };

  return <article className="sv-detail-page">
    <MobileTopbar back>
      <span className="sv-topbar__title sv-u-ell">{software.name}</span>
      <button type="button" className={`sv-btn sv-btn--sm ${favorite.on ? 'sv-btn--soft' : 'sv-btn--ghost'}`} aria-pressed={favorite.on} onClick={favorite.toggle}>{favorite.on ? '★ 已收藏' : '☆ 收藏'}</button>
      <button type="button" className="sv-ib" aria-label="分享" onClick={() => setSheet('share')}>↗</button>
    </MobileTopbar>
    <InAppBar/>
    <span className="sv-sr" role="status">{announce}</span>
    <div className="sv-container">
      <nav className="sv-crumbs" aria-label="面包屑"><Link href="/">首页</Link><span aria-hidden="true"> › </span><Link href={`/software?cat=${software.category}`}>{cat.label}</Link><span aria-hidden="true"> › </span><span aria-current="page">{software.name}</span></nav>
      {requestedRelease && !matched && <p className="sv-oldnote">分享链接中的版本未公开或不属于所选设备，已为你显示当前设备的最新版本。</p>}
      <div className="sv-detail">
        <section className="sv-detail__head" aria-labelledby="sv-detail-title">
          <div className="sv-dhead">
            <SoftIcon software={software} size="xl"/>
            <div className="sv-u-grow">
              <p className="sv-u-xs sv-dhead__cat"><span aria-hidden="true">{cat.icon}</span> {cat.label}{software.developer && <span className="sv-u-muted"> · {software.developer}</span>}</p>
              <h1 id="sv-detail-title">{software.name}{software.is_demo && <span className="sv-demo">示例软件</span>}</h1>
              {software.summary && <p className="sv-u-small sv-u-muted">{software.summary}</p>}
            </div>
            <div className="sv-dhead__actions"><FavButton id={software.id} className=""/><button type="button" className="sv-btn sv-btn--ghost" onClick={() => setSheet('share')}>↗ 分享</button></div>
          </div>
          {release && <Verdict release={release}/>}
        </section>

        <div className="sv-detail__aside">
          <section className="sv-card sv-download" id="sv-download" aria-labelledby="sv-download-title">
            <div className="sv-sh"><h2 id="sv-download-title"><span className="sv-mobile-only">选择你的设备</span><span className="sv-desk-only">下载</span></h2>{auto && <span className="sv-u-xs sv-u-muted sv-mobile-only">已自动识别</span>}</div>
            <div className="sv-devpick" role="group" aria-label="选择设备">{allPlatforms.map(p => {
              const ok = supported.includes(p);
              return <button key={p} type="button" className="sv-dev" aria-pressed={p === platform} disabled={!ok} title={ok ? platformFull[p] : '暂无此设备版本'} aria-label={ok ? undefined : `${platformShort[p]}：暂无此设备版本`} onClick={() => select(p)}>
                <span aria-hidden="true">{platformEmoji[p]}</span>{platformShort[p]}{p === detected && ok && <em>本机</em>}
              </button>;
            })}</div>
            {list.length > 1 ? <div className="sv-versions" role="group" aria-label="选择版本">{list.map((r, i) => <button key={r.id} type="button" aria-pressed={r.id === release?.id} onClick={() => select(platform, i === 0 ? undefined : r)}>
              <b className="sv-mono">{r.version}</b><span className="sv-u-xs">{i === 0 ? '最新' : r.advice === 'hold' ? '有问题' : '旧版'} · {monthDay(r.published_at)}</span>
            </button>)}</div> : <div className="sv-versions-gap"/>}
            <DownloadArea {...downloadProps}/>
            {release && platform !== 'desktop' && <div className="sv-qr sv-desk-only">
              <QrPreview desktopOnly text={shareUrl} label={`扫码在手机上打开${software.name}${platformShort[platform]}版下载页`}/>
              <div className="sv-u-small"><b>用手机扫码下载</b><br/><span className="sv-u-muted">手机扫码后打开这个页面，直接下载{platformShort[platform]}版。{platform === 'tv' && <><br/>也可以在电脑上下载，用 U 盘拷到电视。</>}</span></div>
            </div>}
            {platform === 'desktop' && <p className="sv-u-small sv-u-muted sv-mobile-only sv-pc-hint">💡 这是电脑版，建议到电脑上打开。<button type="button" className="sv-link" onClick={() => copy(`${siteOrigin}${softwarePath(software.slug, 'desktop', historical ? release?.id : undefined)}`, '链接已复制，发到电脑上打开')}>复制链接</button></p>}
          </section>
          <div className="sv-desk-only"><AdSlot settings={station.settings} promotions={station.promotions} placement="desktop_sidebar" variant="side"/></div>
        </div>

        {/* 单页依次展开：安装 → 改了什么 → 反馈 → 历史版本 → 常见问题 → 软件信息，不再藏在标签页里。 */}
        <VersionView id={release?.id}/>
        <section className="sv-card sv-detail__sec" aria-labelledby="sv-guide-title"><GuideTab software={software} release={release} platform={platform}/></section>
        <section className="sv-card sv-detail__sec" aria-labelledby="sv-notes-title"><div className="sv-sh"><h2 id="sv-notes-title">改了什么</h2></div><NotesTab release={release} software={software}/></section>
        <section className="sv-card sv-detail__fb" aria-labelledby="sv-fb-title"><FeedbackBox software={software} latest={latest} historical={historical} onIssue={() => setSheet('issue')}/></section>
        <section className="sv-card sv-detail__sec" aria-labelledby="sv-history-title"><div className="sv-sh"><h2 id="sv-history-title">历史版本</h2></div><HistoryTab list={list} current={release} onPick={chooseVersion}/></section>
        {/* 手机正文广告放在历史版本之后，远离结论和下载按钮。 */}
        <div className="sv-detail__adwide sv-mobile-only"><AdSlot settings={station.settings} promotions={station.promotions} placement="detail_body" variant="wide"/></div>
        <section className="sv-card sv-detail__sec" aria-labelledby="sv-faq-title"><div className="sv-sh"><h2 id="sv-faq-title">常见问题</h2></div><FaqTab software={software} platform={platform}/></section>
        <section className="sv-card sv-detail__sec" aria-labelledby="sv-info-title"><div className="sv-sh"><h2 id="sv-info-title">软件信息</h2></div><InfoTab software={software} release={release}/></section>

        {related.length > 0 && <section className="sv-card sv-detail__related" aria-labelledby="sv-rel-title"><div className="sv-sh"><h2 id="sv-rel-title">相关公告</h2></div>{related.map(n => <AnnCard key={n.id} notice={n} now={now} software={station.software}/>)}</section>}

        {sims.length > 0 && <section className="sv-detail__sims" aria-labelledby="sv-sim-title"><div className="sv-sh"><h2 id="sv-sim-title">大家还在看</h2></div><div className="sv-hs">{sims.map(s => <SimCard key={s.id} software={s} release={simLatest.get(s.id)}/>)}</div></section>}
      </div>
    </div>

    <div className="sv-sticky-dl">
      <button type="button" className="sv-btn sv-btn--ghost sv-sticky-dl__issue" onClick={openIssue} disabled={!latest}>👎 有问题</button>
      <PrimaryDownload {...downloadProps} short/>
    </div>

    <ShareSheet open={sheet === 'share'} onClose={() => setSheet(null)} software={software} release={historical ? release : latest} stable={stable} url={shareUrl}/>
    <FeedbackSheet open={sheet === 'issue'} onClose={() => setSheet(null)} software={software} release={latest} linkId={officialLink(latest)?.id}/>
  </article>;
}

/* ---------- 结论印章 ---------- */
function Verdict({ release }: { release: Release }) {
  const m = adviceMeta[release.advice] || adviceMeta.optional;
  return <div className={`sv-verdict sv-verdict--${m.tone}`}>
    <span className="sv-verdict__icon" aria-hidden="true">{m.icon}</span>
    <div><b>{m.label} · {platformShort[release.platform]}版 {release.version}</b>{release.advice_note && <span className="sv-u-small">{release.advice_note}</span>}</div>
  </div>;
}

/* ---------- 下载区（R-DETAIL-06～09、21） ---------- */
interface DownloadProps { software: Software; release?: Release; latest?: Release; stable?: Release; historical: boolean; platform: Platform; onDownload: (e: React.MouseEvent, id: string) => void; onSelectStable: () => void; short?: boolean }

function primaryRelease({ software, release, stable, historical }: DownloadProps) {
  if (!release) return;
  const state = getReleaseState(software, release);
  return !historical && stable && (release.advice === 'hold' || state.status === 'unavailable') && getReleaseState(software, stable).status !== 'unavailable' ? stable : release;
}

function PrimaryDownload({ software, release, stable, historical, platform, onDownload, onSelectStable, short = false }: DownloadProps) {
  const cls = `sv-btn sv-btn--primary ${short ? 'sv-sticky-dl__main' : 'sv-btn--lg sv-btn--block'}`;
  if (!release) return <button type="button" className={cls} disabled>暂无版本</button>;
  const state = getReleaseState(software, release);
  const stableState = stable ? getReleaseState(software, stable) : undefined;
  const useStable = !historical && !!stable && (release.advice === 'hold' || state.status === 'unavailable') && stableState?.status !== 'unavailable';
  if (useStable && stable) {
    const link = officialLink(stable);
    const label = `⬇ 下载稳定版 ${stable.version}`;
    // 稳定版有官方入口时直接打开；没有时切到稳定版，显示它的全部入口。
    return link ? <a className={cls} href={link.url} target="_blank" rel="noopener noreferrer" onClick={e => onDownload(e, stable.id)}>{label}</a> : <button type="button" className={cls} onClick={onSelectStable}>查看稳定版 {stable.version}{short ? '' : ' 入口'}</button>;
  }
  if (state.status === 'unavailable') return <button type="button" className={cls} disabled>暂时无法下载</button>;
  const link = officialLink(release);
  if (!link) return <button type="button" className={cls} disabled>暂无下载链接</button>;
  const label = platform === 'ios' ? (short ? '⬇ 去 App Store' : '⬇ 去 App Store 下载') : `⬇ 官方下载 ${platformShort[platform]}版${historical ? ` ${release.version}` : ''}`;
  return <a className={cls} href={link.url} target="_blank" rel="noopener noreferrer" onClick={e => onDownload(e, release.id)}>{label}</a>;
}

function DownloadArea(props: DownloadProps) {
  const { software, release, latest, stable, historical, platform, onDownload } = props;
  const { copy } = useStationUi();
  if (!release) return <Empty icon="📭" title="这个设备还没有发布版本"><p className="sv-u-xs">可以先选其他设备，或者过几天再来看看。</p></Empty>;
  const state = getReleaseState(software, release);
  const hold = !historical && release.advice === 'hold';
  const main = officialLink(release);
  const target = primaryRelease(props)!;
  const targetAvailable = getReleaseState(software, target).status !== 'unavailable';
  const primary = targetAvailable ? officialLink(target) : undefined;
  const backups = platform === 'ios' ? [] : backupLinks(release);
  const copyLink = (url: string, id: string) => { track('dl_copy', id); void copy(url, '获取链接已复制，粘贴到浏览器打开'); };
  return <>
    {historical && latest && <p className="sv-oldnote">你正在看旧版本 {release.version}。{latest.advice === 'hold' ? `最新版 ${latest.version} 有使用提醒，请先查看更新建议。` : `没有特别需要，建议下载最新版 ${latest.version}。`}</p>}
    {state.status === 'unavailable' && <p className="sv-alert sv-alert--bad">这个版本暂时无法下载：{state.reason || '入口暂时失效，恢复后会在群公告里通知。'}</p>}
    {state.status === 'attention' && state.reason && <p className="sv-alert sv-alert--warn">⚠ {state.reason}</p>}
    {hold && (stable ? <p className="sv-alert sv-alert--bad">⚠ {release.version} 有问题，建议先下载稳定版 <b>{stable.version}</b></p> : <p className="sv-alert sv-alert--bad">⚠ {release.version} 有问题，建议暂时不要更新</p>)}
    {target.install_notice && <p className="sv-alert sv-alert--warn">安装前请注意{target.id !== release.id ? `（稳定版 ${target.version}）` : ''}：{target.install_notice}</p>}
    <PrimaryDownload {...props}/>
    {primary && <div className="sv-download-tools">
      <button type="button" className="sv-btn sv-btn--ghost" onClick={() => copyLink(primary.url, target.id)}>复制{target.id !== release.id ? '稳定版' : '获取'}链接</button>
      {primary.code && <><span className="sv-u-small">提取码 <span className="sv-code">{primary.code}</span></span><button type="button" className="sv-btn sv-btn--soft" onClick={() => { track('dl_copy', target.id); void copy(primary.code, '提取码已复制'); }}>复制提取码</button></>}
    </div>}
    {!main && backups.length > 0 && state.status !== 'unavailable' && <p className="sv-u-xs sv-u-muted sv-u-mt8">暂未配置官方链接，可以使用下方备用入口。</p>}
    {hold && stable && state.status !== 'unavailable' && (main
      ? <a className="sv-btn sv-btn--ghost sv-btn--block sv-u-mt8" href={main.url} target="_blank" rel="noopener noreferrer" onClick={e => onDownload(e, release.id)}>仍要下载 {release.version}</a>
      : <button type="button" className="sv-btn sv-btn--ghost sv-btn--block sv-u-mt8" disabled>仍要下载 {release.version}（暂无链接）</button>)}
    <p className="sv-meta2">
      {primary && <span>✓ 官方来源 {platform === 'ios' ? 'App Store' : hostOf(primary.url)}</span>}
      {platform === 'ios' ? <span>📦 App Store</span> : target.package_size && <span>📦 {target.package_size}</span>}
      {target.requirements && <span>🖥 {target.requirements}</span>}
    </p>
    {state.status !== 'unavailable' && backups.map((link, i) => <div className="sv-backup" key={link.id || i}>
      <div className="sv-backup__t">
        <b>{link.kind === 'official' ? '其他官方入口' : '备用'}：{link.label || '网盘下载'}</b> <span className="sv-u-xs sv-u-muted">官网打不开时用</span>
        <div className="sv-backup__url"><a href={link.url} target="_blank" rel="noopener noreferrer" onClick={e => onDownload(e, release.id)}>{hostOf(link.url)} ↗</a>{link.code && <> · 提取码 <span className="sv-code">{link.code}</span></>}</div>
      </div>
      <div className="sv-backup__actions"><button type="button" className="sv-btn sv-btn--ghost" onClick={() => copyLink(link.url, release.id)}>复制链接</button>{link.code && <button type="button" className="sv-btn sv-btn--soft" onClick={() => { track('dl_copy', release.id); void copy(link.code, '提取码已复制'); }}>复制提取码</button>}</div>
    </div>)}
  </>;
}

/* ---------- 标签页（R-DETAIL-13～17） ---------- */
function NotesTab({ release, software }: { release?: Release; software: Software }) {
  if (!release) return <p className="sv-u-small sv-u-muted">这个设备还没有发布版本。</p>;
  const groups = changeKindOrder.map(k => [k, release.changes.filter(c => c.kind === k)] as const).filter(([, items]) => items.length);
  const lines = release.notes.split('\n').map(l => l.trim().replace(/^[-*•]\s*/, '')).filter(Boolean);
  return <>
    <p className="sv-diff">{release.previous_version && <><span className="sv-mono">{release.previous_version}</span><span aria-label="升级到">→</span></>}<span className="sv-mono is-new">{release.version}</span><span className="sv-u-faint sv-u-small">{platformShort[release.platform]}版 · {monthDay(release.release_date || release.published_at)}</span></p>
    {release.summary && <p className="sv-u-small sv-u-muted sv-notes__sum">{release.summary}</p>}
    {groups.length ? <ul className="sv-notes">{groups.flatMap(([k, items]) => items.map((c, i) => <li key={`${k}-${i}`}><span className={`sv-kind sv-kind--${changeKindMeta[k].cls}`}>{changeKindMeta[k].label}</span><span>{c.text}</span></li>))}</ul>
      : lines.length ? <ul className="sv-notes sv-notes--plain">{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      : <p className="sv-u-small sv-u-muted">这个版本没有填写更新内容</p>}
    {software.screenshots.length > 0 && <div className="sv-shots" aria-label="截图">{software.screenshots.slice(0, 8).map((url, i) => <a key={url} href={url} target="_blank" rel="noopener noreferrer" aria-label={`查看截图 ${i + 1}`}><img src={url} alt={`${software.name}截图 ${i + 1}`} loading="lazy" width={110} height={196}/></a>)}</div>}
  </>;
}
function GuideTab({ software, release, platform }: { software: Software; release?: Release; platform: Platform }) {
  const steps = software.install_guides?.[platform]?.length ? software.install_guides[platform]! : software.installation;
  return <>
    <div className="sv-sh"><h2 id="sv-guide-title">{platformFull[platform]}怎么装</h2></div>
    {steps.length > 0 && <p className="sv-u-xs sv-u-muted">大约 {Math.max(2, steps.length)} 分钟</p>}
    {steps.length ? <ol className="sv-steps">{steps.map((s, i) => <li key={i}><div><span>{s}</span>{software.install_illustrations?.[platform]?.[i] && <img className="sv-guide-image" src={software.install_illustrations[platform]![i]} alt={`${platformFull[platform]}安装步骤 ${i + 1}`} width={480} height={320} loading="lazy"/>}</div></li>)}</ol> : <p className="sv-u-small sv-u-muted">安装教程正在整理中。</p>}
    <div className="sv-tip">💡 {software.install_tips?.[platform] || release?.install_notice || defaultInstallTip[platform]}</div>
  </>;
}
function FaqTab({ software, platform }: { software: Software; platform: Platform }) {
  const faqs = software.faqs.filter(f => !f.platforms?.length || f.platforms.includes(platform));
  return <div className="sv-faq">
    {faqs.map((f, i) => <details key={i}><summary>{f.question}</summary><p>{f.answer}</p></details>)}
    <details><summary>以上都没解决？</summary><p>点下方“有问题”提交反馈，或在群里 @群主，说一下设备型号和卡在哪一步。</p></details>
  </div>;
}
function HistoryTab({ list, current, onPick }: { list: Release[]; current?: Release; onPick: (r: Release) => void }) {
  if (!list.length) return <p className="sv-u-small sv-u-muted">这个设备还没有发布版本。</p>;
  return <>
    <ol className="sv-timeline">{list.map((r, i) => <li key={r.id} className={`${i === 0 ? 'is-cur' : ''}${r.advice === 'hold' ? ' is-bad' : ''}`}>
      <div className="sv-u-row"><b className="sv-mono">{r.version}</b><AdviceTag advice={r.advice}/><span className="sv-u-xs sv-u-faint sv-u-mlauto">{monthDay(r.published_at)}</span></div>
      <p className="sv-u-small sv-u-muted">{r.summary}{i > 0 && <>{r.summary && ' · '}{current?.id === r.id ? <span>正在查看</span> : <button type="button" className="sv-link" onClick={() => onPick(r)}>下载这个版本</button>}</>}</p>
    </li>)}</ol>
    {list.length === 1 && <p className="sv-u-small sv-u-faint">暂无更早的版本记录</p>}
  </>;
}
function InfoTab({ software, release }: { software: Software; release?: Release }) {
  const site = software.website_url && /^https?:\/\//i.test(software.website_url) ? software.website_url : '';
  const rows: [string, React.ReactNode][] = [
    ['开发者', software.developer],
    ['收费说明', software.pricing],
    ['收录日期', (software.listed_at || software.created_at || '').slice(0, 10)],
    ['官方网站', site && <a href={site} target="_blank" rel="noopener noreferrer">{hostOf(site)} ↗</a>],
    ['支持设备', allPlatforms.filter(p => software.platforms.includes(p)).map(p => platformFull[p]).join('、')],
    ['系统要求', release?.requirements],
    ['安装包大小', release?.package_size],
    ['标签', software.tags.length > 0 && <span className="sv-u-row sv-u-wrap">{software.tags.map(t => <span key={t} className="sv-mini">{t}</span>)}</span>],
  ];
  const visible = rows.filter(([, v]) => v);
  return <table className="sv-info"><tbody>{visible.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v}</td></tr>)}</tbody></table>;
}

/* ---------- 反馈条（R-DETAIL-18）：只对当前设备的当前版本投票，本机每版本一票 ---------- */
function FeedbackBox({ software, latest, historical, onIssue }: { software: Software; latest?: Release; historical: boolean; onIssue: () => void }) {
  const { toast } = useStationUi();
  const records = useLocalStore(feedbackStore);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState<(VoteResult & { id: string }) | null>(null);
  useEffect(() => { const receive = (event: Event) => setLive((event as CustomEvent).detail); window.addEventListener('station:vote', receive); return () => window.removeEventListener('station:vote', receive); }, []);
  if (!latest) return <><div className="sv-sh"><h2 id="sv-fb-title">更新后能正常用吗？</h2></div><p className="sv-u-small sv-u-muted">这个设备还没有发布版本。</p></>;
  const mine = records.find(r => r.releaseId === latest.id)?.verdict;
  const rate = feedbackRate(live?.id === latest.id ? { ...latest, feedback_ok: live.oks, feedback_issue: live.issues } : latest);
  async function vote(verdict: 'ok' | 'issue') {
    if (!latest) return;
    setBusy(true);
    try {
      const next = mine === verdict ? 'none' : verdict;
      await castFeedback(software, latest, next);
      if (next === 'issue') onIssue();
      toast(next === 'none' ? '已撤销你的反馈' : next === 'ok' ? '谢谢你的反馈 👍' : '已记录有问题，可继续补充说明');
    } catch (error) { toast(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <>
    <div className="sv-sh"><h2 id="sv-fb-title">{historical ? `最新版 ${latest.version} 能正常用吗？` : '更新后能正常用吗？'}</h2><span className="sv-u-xs sv-u-muted">{rate.total} 人反馈</span></div>
    <div className="sv-fb">
      <button type="button" aria-pressed={mine === 'ok'} disabled={busy} onClick={() => vote('ok')}>👍 能正常用 · {rate.ok}</button>
      <button type="button" aria-pressed={mine === 'issue'} disabled={busy} onClick={() => vote('issue')}>👎 有问题 · {rate.issue}</button>
    </div>
    <div className={`sv-bar${rate.total ? "" : " is-empty"}`} role="img" aria-label={rate.total ? `${rate.pct}% 的群友反馈能正常使用` : '还没有反馈'}><i style={{ width: `${rate.total ? rate.pct : 0}%` }}/></div>
    <p className="sv-u-xs sv-u-muted sv-u-mt4">{rate.total ? <>{rate.pct}% 的群友反馈能正常使用{rate.pct < 60 && rate.total >= 10 && <b className="sv-u-bad"> · 问题较多，建议先等等</b>}</> : '还没有人反馈，装好后来说一声吧'}{mine && ' · 你已反馈'}</p>
  </>;
}

function VersionView({ id }: { id?: string }) { useEffect(() => { if (id) trackDaily('release_view', id); }, [id]); return null; }
