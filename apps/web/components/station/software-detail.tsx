'use client';
import { useEffect, useState } from 'react';
import { StationLink as Link } from './design-context';
import { ArrowDownToLine, ArrowLeft, BookOpen, Check, ChevronDown, ChevronRight, ExternalLink, History, Info, Link2 } from 'lucide-react';
import type { Platform, Release, Software, SoftwareData, StationData } from '@/lib/station-types';
import { formatDate, getReleaseState, isExpired, platformActions, platformNames, safeLink } from '@/lib/station';
import { AnnouncementCallout, CopyButton, DeviceIcon, SoftwareIcon, StatusBadge } from './common';
import { AdSlot } from './ad-slot';

function versionLabel(release: Release) { return `v${release.version.replace(/^v/i, '')}`; }
function DownloadPanel({ software, release, platform }: { software: Software; release?: Release; platform: Platform }) {
  const { status, reason } = getReleaseState(software, release);
  const links = (release?.links || []).filter(link => safeLink(link.url));
  const primary = links.find(link => link.is_primary) || links[0];
  const canGet = status !== 'unavailable' && !!primary;
  return <section id="get-software" className="st-get-panel" aria-labelledby="get-heading">
    <div className="st-section-title"><h2 id="get-heading"><ArrowDownToLine size={21}/>获取这个版本</h2><span className="st-muted st-small">{platformNames[platform]} {release && versionLabel(release)}</span></div>
    {release?.install_notice && <div className="st-install-notice"><Info size={18}/><p>{release.install_notice}</p></div>}
    {canGet && primary ? <>
      <div className="st-source"><span>获取来源</span><strong>{primary.label || new URL(primary.url).hostname}</strong><small>{new URL(primary.url).hostname}</small></div>
      <div className="st-download-actions"><a href={safeLink(primary.url)} target="_blank" rel="noopener noreferrer" className="st-button st-primary"><ArrowDownToLine size={18}/>{platformActions[platform]}<ExternalLink size={15}/></a><CopyButton text={primary.url}/></div>
      {primary.code && <div className="st-extraction"><span>提取码</span><strong>{primary.code}</strong><CopyButton text={primary.code} label="复制提取码"/></div>}
      {links.filter(link => link !== primary).map((link, i) => <div className="st-backup-link" key={link.id || i}><a href={safeLink(link.url)} target="_blank" rel="noopener noreferrer">备用入口：{link.label}<ExternalLink size={14}/></a><CopyButton text={link.url}/>{link.code && <div className="st-extraction"><span>提取码</span><strong>{link.code}</strong><CopyButton text={link.code} label="复制提取码"/></div>}</div>)}
    </> : <div className="st-unavailable"><Info size={23}/><div><strong>{status === 'unavailable' ? '暂时无法使用' : '暂未配置获取链接'}</strong><p>{status === 'unavailable' ? reason || '恢复后会在本站公告，请留意最新消息。' : software.is_demo ? '这是示例软件，管理员尚未添加真实获取入口。' : '此版本尚无获取入口，可以选择其他版本或稍后再来。'}</p></div></div>}
    <p className="st-browser-help"><Link2 size={16}/>应用内无法打开？复制链接，粘贴到手机浏览器中打开。</p>
  </section>;
}

export function SoftwareDetail({ data, station, requestedPlatform, requestedRelease }: { data: SoftwareData; station: StationData; requestedPlatform?: string; requestedRelease?: string }) {
  const { software } = data;
  const ordered = [...data.releases].sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  const matched = ordered.find(r => r.id === requestedRelease && (!requestedPlatform || r.platform === requestedPlatform));
  const fallback = matched?.platform || (software.platforms.includes(requestedPlatform as Platform) ? requestedPlatform as Platform : software.platforms[0]);
  const [platform, setPlatform] = useState<Platform>(fallback || 'android');
  const [releaseId, setReleaseId] = useState<string | undefined>(matched?.id);
  const [selectionMessage, setSelectionMessage] = useState('');
  const releases = ordered.filter(r => r.platform === platform);
  const latest = releases[0];
  const release = releases.find(r => r.id === releaseId) || latest;
  const historical = !!release && release.id !== latest?.id;
  const { status, reason } = getReleaseState(software, release);
  const canGet = status !== 'unavailable' && !!release?.links.some(link => safeLink(link.url));
  const notices = data.announcements.filter(n => !isExpired(n) && n.importance !== 'normal');

  useEffect(() => {
    function syncLocation() {
      const query = new URLSearchParams(window.location.search);
      const id = query.get('release'); const p = query.get('platform');
      const selected = data.releases.find(r => r.id === id && (!p || r.platform === p));
      setPlatform(selected?.platform || (software.platforms.includes(p as Platform) ? p as Platform : fallback || 'android'));
      setReleaseId(selected?.id);
    }
    window.addEventListener('popstate', syncLocation);
    return () => window.removeEventListener('popstate', syncLocation);
  }, [data.releases, software.platforms, fallback]);

  function select(p: Platform, selected?: Release) {
    setPlatform(p); setReleaseId(selected?.id);
    setSelectionMessage(`已切换到${platformNames[p]}${selected ? ` ${versionLabel(selected)}` : '最新版本'}`);
    const url = new URL(window.location.href);
    url.searchParams.set('platform', p);
    if (selected) url.searchParams.set('release', selected.id); else url.searchParams.delete('release');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  }

  return <article className="st-page st-detail-page">
    <Link className="st-back" href="/software"><ArrowLeft size={17}/>全部软件</Link>
    <header className="st-software-heading"><SoftwareIcon software={software} large/><div><div className="st-title-with-demo"><h1>{software.name}</h1>{software.is_demo && <span className="st-label">示例软件</span>}</div><p>{software.summary}</p><span className="st-small st-muted">固定软件入口 · 新旧版本都在这里</span></div><CopyButton label="复制本页链接"/></header>
    {notices.map(n => <AnnouncementCallout key={n.id} notice={n}/>)}
    {requestedRelease && !matched && <p className="st-inline-info">分享链接中的版本未公开或不属于所选设备，已为你显示当前设备的最新版本。请在下方重新选择。</p>}
    <span className="sr-only" role="status">{selectionMessage}</span>
    <div className="st-detail-columns"><div className="st-detail-main">
      <section className="st-device-section" aria-labelledby="device-heading"><div className="st-section-title"><h2 id="device-heading">选择设备</h2><span className="st-small st-muted">也可以用手机获取电视版</span></div><div className="st-platform-tabs" role="group" aria-label="软件设备">{software.platforms.map(p => <button key={p} className={platform === p ? 'st-selected' : ''} onClick={() => select(p)} aria-pressed={platform === p}><DeviceIcon platform={p} size={19}/>{platformNames[p]}{platform === p && <Check size={16}/>}</button>)}</div></section>
      <section className="st-version-library" id="versions" aria-labelledby="versions-heading"><div className="st-section-title"><h2 id="versions-heading"><History size={20}/>版本下载</h2><span className="st-small st-muted">{releases.length} 个已发布版本</span></div><p className="st-small st-muted">优先使用最新版。设备不兼容时，可选择仍然可用的旧版。</p><div className="st-version-options" role="group" aria-label="选择下载版本">{releases.map((r, i) => {
        const state = getReleaseState(software, r);
        const available = state.status !== 'unavailable' && r.links.some(link => safeLink(link.url));
        return <button key={r.id} className={`st-version-option${release?.id === r.id ? ' st-selected' : ''}`} aria-pressed={release?.id === r.id} onClick={() => select(platform, r)}><span><strong>{versionLabel(r)}</strong><small>{i === 0 ? '最新版' : '历史版'}</small>{release?.id === r.id && <Check size={16}/>}</span><time>{formatDate(r.published_at)}</time><span className={available ? 'st-version-available' : 'st-muted'}>{state.status === 'unavailable' ? '暂不可用' : available ? '可获取' : '未配置链接'}</span></button>;
      })}</div>{!releases.length && <p className="st-muted">这个设备还没有发布版本，请选择其他设备或稍后再来。</p>}{releases.length === 1 && <p className="st-version-first">当前设备的首个版本，暂无更早版本。</p>}</section>
      <section className="st-version-section" id="version" aria-live="polite"><div className="st-section-title"><h2>{historical ? '所选历史版本' : '最新版本'}</h2><StatusBadge status={status}/></div>{release ? <><div className="st-version-head"><strong>{versionLabel(release)}</strong><span><DeviceIcon platform={platform}/>{platformNames[platform]}</span><time>发布于 {formatDate(release.published_at)}</time></div>{historical && <div className="st-inline-info">你已选择历史版本，以下获取入口和安装提醒属于此版本。<button onClick={() => select(platform)}>切换最新版 {versionLabel(latest)}</button></div>}{reason && status !== 'normal' && <p className="st-state-reason"><Info size={17}/>{reason}</p>}<h3>更新内容</h3><p className="st-update-summary-detail">{release.summary}</p><div className="st-prose">{release.notes.split('\n').filter(Boolean).map((line, i) => <p key={i}>{line.replace(/^[-*]\s*/, '• ')}</p>)}</div></> : <p className="st-muted">暂无版本信息。</p>}</section>
      <DownloadPanel software={software} release={release} platform={platform}/>
      <AdSlot enabled={station.settings.ads_enabled} promotions={station.promotions} placement="detail_body"/>
      <section className="st-content-section" id="installation"><h2><BookOpen size={20}/>安装方法</h2>{software.installation.length ? <ol className="st-install-steps">{software.installation.map((step, i) => <li key={i}><span>{i + 1}</span><p>{step}</p></li>)}</ol> : <p className="st-muted">安装说明正在整理中，请先查看所选版本的安装提醒。</p>}{software.screenshots.length > 0 && <div className="st-screenshots">{software.screenshots.map((url, i) => <a href={url} target="_blank" rel="noopener noreferrer" key={url}><img src={url} alt={`${software.name}使用示意图 ${i + 1}`} loading="lazy"/></a>)}</div>}</section>
      <section className="st-content-section"><h2>常见问题</h2>{software.faqs.length ? <div className="st-faq-list">{software.faqs.map((faq, i) => <details key={i}><summary>{faq.question}<ChevronDown size={18}/></summary><p>{faq.answer}</p></details>)}</div> : <p className="st-muted">还没有收录常见问题，遇到问题可以在群里反馈。</p>}</section>
    </div><aside className="st-detail-aside"><section className="st-detail-guide"><span className="st-guide-icon"><BookOpen size={24}/></span><h2>选对版本，再安装</h2><p>每个版本都有独立的获取入口。换版本后，请重新确认安装提醒和提取码。</p><div className="st-detail-directory"><a href="#versions">选择版本<ChevronRight size={16}/></a><a href="#get-software">获取入口<ChevronRight size={16}/></a><a href="#installation">安装方法<ChevronRight size={16}/></a></div><CopyButton label="复制本页链接"/></section><AdSlot enabled={station.settings.ads_enabled} promotions={station.promotions} placement="desktop_sidebar"/>{station.settings.instructions && <section className="st-detail-instructions"><Info size={19}/><p>{station.settings.instructions}</p></section>}</aside></div>
    <div className="st-fixed-get"><div><span>{platformNames[platform]}{historical ? ' · 历史版' : ''}</span><strong>{release ? versionLabel(release) : '暂无版本'}</strong></div><a href="#get-software" className={`st-button ${canGet ? 'st-primary' : 'st-disabled-link'}`}><ArrowDownToLine size={18}/>{canGet ? platformActions[platform] : status === 'unavailable' ? '查看不可用原因' : '暂无获取链接'}</a></div>
  </article>;
}
