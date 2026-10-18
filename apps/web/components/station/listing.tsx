'use client';

import { useMemo, useState } from 'react';
import { StationLink as Link } from './design-context';
import { ArrowUpRight, BookOpen, Check, ChevronRight, Search, ShieldCheck, X, Boxes, RefreshCw } from 'lucide-react';
import type { Platform, Release, Software, StationData } from '@/lib/station-types';
import { allPlatforms, formatDate, getReleaseState, getSoftwareState, isExpired, platformLabels } from '@/lib/station';
import { AnnouncementCallout, DeviceIcon, EmptyState, PlatformTags, SoftwareIcon, StatusBadge } from './common';
import { AdSlot } from './ad-slot';

function Filters({ query, setQuery, platform, setPlatform, available }: { query: string; setQuery: (value: string) => void; platform: string; setPlatform: (value: string) => void; available: Platform[] }) {
  return <div className="st-filters">
    <label className="st-search"><Search size={21}/><input placeholder="搜索软件名称或别名" aria-label="搜索软件名称或别名" value={query} onChange={e => setQuery(e.target.value)}/>{query && <button type="button" aria-label="清除搜索" onClick={() => setQuery('')}><X size={18}/></button>}<span className="st-search-key">快速找软件</span></label>
    <div className="st-device-filters" role="group" aria-label="按设备筛选"><button onClick={() => setPlatform('all')} aria-pressed={platform === 'all'} className={platform === 'all' ? 'st-selected' : ''}><Boxes size={16}/>全部</button>{allPlatforms.filter(p => available.includes(p)).map(p => <button key={p} onClick={() => setPlatform(p)} aria-pressed={platform === p} className={platform === p ? 'st-selected' : ''}><DeviceIcon platform={p} size={17}/>{platformLabels[p]}</button>)}</div>
  </div>;
}

export function UpdateRow({ release, software }: { release: Release; software: Software }) {
  const { status } = getReleaseState(software, release);
  return <Link className="st-update-row" href={`/software/${software.slug}?platform=${release.platform}&release=${release.id}#version`}>
    <SoftwareIcon software={software}/>
    <div className="st-update-content"><div className="st-update-title"><h3>{software.name}</h3><span className="st-version">v{release.version.replace(/^v/i, '')}</span>{software.is_demo && <span className="st-demo-small">示例</span>}</div><div className="st-update-meta"><span className="st-device-tag"><DeviceIcon platform={release.platform} size={14}/>{platformLabels[release.platform]}</span><time className="st-row-date">{formatDate(release.published_at)}</time>{status !== 'normal' && <StatusBadge status={status}/>}</div></div>
    <p className="st-update-summary">{release.summary}</p>
    <span className="st-mobile-update-action">查看更新<ChevronRight size={15}/></span>
    <span className="st-update-action">查看更新<ChevronRight size={16}/></span>
  </Link>;
}

function DirectoryCard({ software, releases, platform }: { software: Software; releases: Release[]; platform?: Platform }) {
  const state = getSoftwareState(software, releases, platform);
  const latest = releases.filter(r => r.software_id === software.id && (!platform || r.platform === platform)).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))[0];
  return <Link className="st-software-card" href={`/software/${software.slug}${platform ? `?platform=${platform}` : ''}`}>
    <div className="st-software-card-title"><SoftwareIcon software={software}/><div><h2>{software.name}</h2><span>{software.is_demo ? '示例软件' : '软件资料'}{latest ? ` · ${platformLabels[latest.platform]} v${latest.version.replace(/^v/i, '')}` : ''}</span></div><ArrowUpRight size={18}/></div>
    <p>{software.summary}</p><PlatformTags platforms={software.platforms}/>
    {state.reason === '各设备状态不同，请查看详情' && <div className="st-software-state-note">{state.reason}</div>}
    <div className="st-software-card-foot"><StatusBadge status={state.status}/><span>查看软件<ChevronRight size={15}/></span></div>
  </Link>;
}

function HelpAside({ data }: { data: StationData }) {
  return <aside className="st-aside">
    <section className="st-shortcuts"><div className="st-side-heading"><h2>常用软件</h2><Link href="/software">全部<ArrowUpRight size={15}/></Link></div><div className="st-shortcut-grid">{data.software.slice(0, 6).map(s => { const release = [...data.releases].filter(r => r.software_id === s.id).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))[0]; return <Link href={`/software/${s.slug}${release ? `?platform=${release.platform}` : ''}`} key={s.id}><SoftwareIcon software={s}/><span className="st-shortcut-name">{s.name}</span>{release && <span className="st-shortcut-version">{platformLabels[release.platform]} v{release.version.replace(/^v/i, '')}</span>}</Link>; })}</div></section>
    <section className="st-first-visit" id="getting-started"><span className="st-aside-icon"><BookOpen size={22}/></span><h2>第一次来？这样用就好</h2><p>找到软件，选对设备，再看看安装提醒。</p><ol><li><span>1</span><div><strong>找到你正在用的软件</strong><small>搜索名称，或按设备筛选</small></div></li><li><span>2</span><div><strong>看一眼本次更新</strong><small>确认版本和使用状态</small></div></li><li><span>3</span><div><strong>按步骤获取与安装</strong><small>留意来源和安装前提醒</small></div></li></ol><Link href="/software">去软件目录<ArrowUpRight size={17}/></Link></section>
    <section className="st-sidebar-notices"><div className="st-side-heading"><h2>小站公告</h2><Link href="/announcements">全部<ArrowUpRight size={15}/></Link></div>{data.announcements.filter(n => !isExpired(n)).slice(0, 2).map(n => <Link href={`/announcements/${n.slug}`} key={n.id}><strong>{n.title}</strong><time>{formatDate(n.published_at)}</time></Link>)}</section>
    <AdSlot enabled={data.settings.ads_enabled} promotions={data.promotions} placement="desktop_sidebar"/>
    <div className="st-assurance"><ShieldCheck size={18}/><p>获取入口由管理员维护。<br/>安装前，请先确认自己的设备。</p></div>
  </aside>;
}

export function StationListing({ data, directory = false }: { data: StationData; directory?: boolean }) {
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState('all');
  const available = [...new Set(data.software.flatMap(s => s.platforms))];
  const software = useMemo(() => data.software.filter(s => (platform === 'all' || s.platforms.includes(platform as Platform)) && `${s.name} ${s.aliases.join(' ')}`.toLowerCase().includes(query.trim().toLowerCase())), [data.software, platform, query]);
  const releases = data.releases.filter(r => software.some(s => s.id === r.software_id) && (platform === 'all' || r.platform === platform)).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  const groups = Object.entries(releases.reduce<Record<string, Release[]>>((acc, r) => { const key = formatDate(r.published_at); (acc[key] ||= []).push(r); return acc; }, {}));
  const pinned = data.announcements.filter(n => n.pinned && !isExpired(n)).sort((a, b) => ({ urgent: 2, important: 1, normal: 0 }[b.importance] - { urgent: 2, important: 1, normal: 0 }[a.importance]))[0];
  const reset = () => { setQuery(''); setPlatform('all'); };
  return <div className={`st-page${directory ? ' st-directory' : ' st-home-page'}`}>
    <header className="st-page-heading"><div><h1>{directory ? '软件目录' : '每次更新，都在这里。'}</h1><p>{directory ? '找到你的软件，选择适合设备的版本。' : data.settings.site_description}</p></div><span className="st-content-caption">{directory ? `${data.software.length} 款软件` : <><ShieldCheck size={17}/>群友免登录，随时查更新</>}</span></header>
    {!directory && pinned && <div className="st-pinned-wrap"><AnnouncementCallout notice={pinned}/><Link href="/announcements" className="st-all-notices">全部公告<ArrowUpRight size={15}/></Link></div>}
    <div className={directory ? '' : 'st-home-columns'}><div className="st-feed-column">
      <Filters query={query} setQuery={setQuery} platform={platform} setPlatform={setPlatform} available={available}/>
      <div className="st-list-heading"><h2>{directory ? '全部软件' : '最新更新'}<span>{directory ? software.length : releases.length}</span></h2><p>{query ? `“${query}”的搜索结果` : directory ? '按设备找到适合你的版本' : <><RefreshCw size={13}/>按发布时间排序</>}</p></div>
      {directory ? software.length ? <div className="st-software-grid">{software.map(s => <DirectoryCard key={s.id} software={s} releases={data.releases} platform={platform === 'all' ? undefined : platform as Platform}/>)}</div> : <EmptyState onReset={reset}/> : groups.length ? <div className="st-feed">{groups.map(([date, items], groupIndex) => <div key={date} className="st-date-group"><div className="st-date-heading"><span className={`st-timeline-dot${groupIndex === 0 ? ' st-timeline-new' : ''}`}/><time>{date}</time>{groupIndex === 0 && <span className="st-recent-tag">最近发布</span>}<span className="st-date-line"/></div><div className="st-update-list">{items.map(release => { const s = data.software.find(s => s.id === release.software_id)!; return <div key={release.id}><UpdateRow release={release} software={s}/>{releases.findIndex(r => r.id === release.id) === Math.min(2, releases.length - 1) && <AdSlot enabled={data.settings.ads_enabled} promotions={data.promotions} placement="home_feed"/>}</div>; })}</div></div>)}<div className="st-list-end"><Check size={16}/>已经看到全部更新了</div></div> : <EmptyState title={query || platform !== 'all' ? '没有找到对应的更新' : '还没有发布更新'} description={query || platform !== 'all' ? '换个关键词，或清除筛选后再看看。' : '管理员发布新版本后，会在这里第一时间展示。'} onReset={query || platform !== 'all' ? reset : undefined}/>}
      {data.software.some(s => s.is_demo) && <div className="st-demo-note">当前内容为演示示例，未配置入口的软件暂不提供获取链接。</div>}
    </div>{!directory && <HelpAside data={data}/>}</div>
  </div>;
}
