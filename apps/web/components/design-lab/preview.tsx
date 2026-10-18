'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Bell, Bookmark, Check, ChevronDown, ChevronRight, CircleAlert, Clock3, ExternalLink, FileText, Folder, Grid2X2, LayoutGrid, Megaphone, Monitor, Search, Smartphone, Sparkles, Tv, X } from 'lucide-react';
import { CopyButton, DeviceIcon, SoftwareIcon } from '@/components/station/common';
import { allPlatforms, formatDate, getReleaseState, isExpired, platformActions, platformLabels, platformNames, safeLink } from '@/lib/station';
import { designFamilies, labDesigns, labHref, labTokens, type LabDesign } from '@/lib/design-lab';
import type { Announcement, Platform, Release, Software, StationData } from '@/lib/station-types';

type Section = 'home' | 'software' | 'detail' | 'announcements' | 'announcement';
interface Props { design: LabDesign; data: StationData; section: Section; slug?: string; initialPlatform?: string; initialRelease?: string; capture?: boolean }
const familyIcons = { utility:ArrowDownToLine, editorial:FileText, swiss:LayoutGrid, cinema:Tv, organic:Bookmark, graphic:Sparkles, workspace:Folder, heritage:FileText, digital:Grid2X2, community:Megaphone };
const tableLayouts = ['compact','index','screening','files','inbox','explorer'];
const timelineLayouts = ['axis','timeline','ink','margin'];

export function DesignPreview({ design, data, section, slug, initialPlatform, initialRelease, capture }: Props) {
  const [adDemo, setAdDemo] = useState(false);
  const [query, setQuery] = useState('');
  const [platform, setPlatform] = useState<Platform | 'all'>('all');
  const base = labHref(design.id);
  const family = designFamilies.find(f => f.id === design.family)!;
  const BrandIcon = familyIcons[design.family];
  const sw = data.software.find(item => item.slug === slug);
  const notice = data.announcements.find(item => item.slug === slug);
  const isDetails = section === 'detail';
  const nav = [{ path:'', label:'最新', icon:Clock3, active:section === 'home' }, { path:'/software', label:'软件', icon:Grid2X2, active:section === 'software' || isDetails }, { path:'/announcements', label:'公告', icon:Bell, active:section === 'announcements' || section === 'announcement' }];
  const current = labDesigns.findIndex(d => d.id === design.id);
  return <div className={`lab-preview lab-family-${design.family} lab-layout-${design.layout} lab-section-${section}${capture ? ' lab-capture' : ''}`} style={labTokens(design)} data-design={design.id}>
    {!capture && <div className="lab-review"><Link href="/designs"><ArrowLeft size={15}/><span>50 套设计</span></Link><span className="lab-review-name">{design.id} {design.name}<small>{family.name}</small></span><div><Link aria-label="上一套设计" href={labHref(labDesigns[(current+49)%50].id)}><ArrowLeft size={16}/></Link><Link aria-label="下一套设计" href={labHref(labDesigns[(current+1)%50].id)}><ArrowRight size={16}/></Link><button aria-pressed={adDemo} onClick={() => setAdDemo(!adDemo)} className="lab-review-ad">{adDemo ? '收起推广演示' : '预览推广位置'}</button></div></div>}
    <a className="lab-skip" href="#lab-content">跳到主要内容</a>
    <div className="lab-site">
      <header className="lab-header"><Link href={base} className="lab-brand"><span><BrandIcon size={23}/></span><strong>{data.settings.site_name}</strong></Link><span className="lab-brand-note">软件更新 · 群内消息</span><nav aria-label="主导航">{nav.map(n => <Link key={n.path} href={base+n.path} aria-current={n.active ? 'page' : undefined}>{n.label}</Link>)}</nav><Link className="lab-header-guide" href={base+'/software'}>找软件<ArrowRight size={16}/></Link></header>
      <main id="lab-content" className="lab-main">
        {section === 'home' || section === 'software' ? <>
          {section === 'home' ? <HomeHero design={design} data={data} onPlatform={setPlatform} platform={platform}/> : <div className="lab-page-title"><h1>软件目录</h1><p>找到常用软件，查看对应设备的版本与安装方法。</p></div>}
          <div className="lab-body">
            <aside className="lab-sidebar"><span className="lab-side-title">我的设备</span>{allPlatforms.filter(p => data.software.some(s => s.platforms.includes(p))).map(p => <button key={p} onClick={() => setPlatform(p)} aria-pressed={platform === p}><DeviceIcon platform={p}/>{platformNames[p]}<ChevronRight size={14}/></button>)}<div className="lab-side-help"><Bookmark size={19}/><strong>把入口留在身边</strong><p>保存本页，下次不用翻群消息。</p><CopyButton text={undefined} label="复制本页链接"/></div>{adDemo && <PromoDemo placement="桌面侧栏推广区域"/>}</aside>
            <div className="lab-content-column">
              <PinnedNotice data={data} design={design}/>
              <div className="lab-find"><label className="lab-search"><Search size={19}/><input aria-label="搜索软件名称或别名" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索软件名称或常用别名"/>{query && <button aria-label="清除搜索" onClick={() => setQuery('')}><X size={17}/></button>}</label><div className="lab-filters" aria-label="设备筛选">{(['all',...allPlatforms.filter(p => data.software.some(s => s.platforms.includes(p)))] as const).map(p => <button key={p} onClick={() => setPlatform(p)} aria-pressed={platform === p}>{p === 'all' ? '全部' : platformLabels[p]}</button>)}</div></div>
              <SoftwareListing data={data} design={design} query={query} platform={platform} directory={section === 'software'} adDemo={adDemo} clear={() => { setQuery(''); setPlatform('all'); }}/>
            </div>
            <aside className="lab-right-sidebar"><div className="lab-side-news"><h2>群内公告</h2>{data.announcements.filter(n => !isExpired(n)).slice(0,3).map(n => <Link key={n.id} href={base+'/announcements/'+n.slug}><span>{formatDate(n.published_at)}</span><strong>{n.title}</strong><ChevronRight size={15}/></Link>)}</div><div className="lab-side-help"><strong>第一次来？</strong><p>先选择设备，再查看版本。安装提醒请在获取前读一遍。</p><Link href={base+'/software'}>浏览软件目录<ArrowRight size={15}/></Link></div>{adDemo && <PromoDemo placement="桌面侧栏推广区域"/>}</aside>
          </div>
        </> : isDetails && sw ? <SoftwareDetail key={sw.id} software={sw} data={data} design={design} initialPlatform={initialPlatform} initialRelease={initialRelease} adDemo={adDemo}/> : section === 'announcement' && notice ? <AnnouncementDetail notice={notice} data={data} design={design}/> : <NoticeList data={data} design={design}/>}
        <footer className="lab-footer"><strong>{data.settings.site_name}</strong><span>软件更新、安装说明和群公告，都在这里。</span><small>演示内容 · 获取入口由管理员维护</small></footer>
      </main>
      {!isDetails && <nav className="lab-bottom" aria-label="手机导航">{nav.map(({path,label,icon:Icon,active}) => <Link key={path} href={base+path} aria-current={active ? 'page' : undefined}><Icon size={21}/><span>{label}</span></Link>)}</nav>}
    </div>
  </div>;
}

function HomeHero({design:d,data,onPlatform,platform}:{design:LabDesign;data:StationData;onPlatform:(p:Platform)=>void;platform:Platform|'all'}) {
  const apps = data.software.slice(0,5);
  const latest = [...data.releases].sort((a,b) => (b.published_at || '').localeCompare(a.published_at || ''))[0];
  const latestApp = data.software.find(s => s.id === latest?.software_id);
  const deviceTiles = <div className="lab-device-tiles">{allPlatforms.filter(p => data.software.some(s => s.platforms.includes(p))).map(p => <button key={p} aria-pressed={platform === p} onClick={() => onPlatform(p)}><DeviceIcon platform={p} size={23}/><strong>{platformNames[p]}</strong><span>查看更新<ChevronRight size={13}/></span></button>)}</div>;
  const appShelf = <div className="lab-app-shelf">{apps.map(s => <Link key={s.id} href={labHref(d.id,'/software/'+s.slug)}><SoftwareIcon software={s}/><span>{s.name}</span></Link>)}</div>;
  const featured = latest && latestApp && <Link className="lab-featured" href={labHref(d.id,`/software/${latestApp.slug}?platform=${latest.platform}&release=${latest.id}`)}><span className="lab-featured-label">最新版本</span><SoftwareIcon software={latestApp}/><div><strong>{latestApp.name}</strong><span>{platformLabels[latest.platform]} v{latest.version}</span></div><p>{latest.summary}</p><span className="lab-featured-action">查看更新<ArrowRight size={18}/></span></Link>;
  return <section className="lab-hero">
    <div className="lab-hero-copy"><div className="lab-hero-kicker"><span className="lab-small-dot"/>{d.family === 'editorial' || d.family === 'heritage' ? formatDate(latest?.published_at) : '给群友的软件更新站'}</div><h1>{d.headline}</h1><p>{data.settings.site_description}</p>
      {['journal','gazette','folio','digest','margin'].includes(d.layout) && <div className="lab-edition"><span>更新日刊</span><span>{data.software.length} 款软件</span><span>版本记录持续归档</span></div>}
      {['files','inbox','explorer'].includes(d.layout) && <div className="lab-breadcrumb"><Folder size={15}/>更新小站<ChevronRight size={13}/>{d.layout === 'inbox' ? '收件箱' : '软件归档'}</div>}
      {['marquee','widescreen','screening','midnight','neon'].includes(d.layout) && <div className="lab-cinema-note"><span/><span/><span/>为手机、电视与电脑准备好新版本</div>}
    </div>
    {['finder','blocks','orbit','bauhaus','prism','neighborhood','split'].includes(d.layout) ? deviceTiles : ['dock','bamboo','glass','seal','mesh','bulletin'].includes(d.layout) ? appShelf : ['gazette','widescreen','clay','poster','screening'].includes(d.layout) ? featured : <div className="lab-hero-art" aria-hidden="true"><HeroArt design={d} apps={apps}/></div>}
    {d.layout === 'chat' && <div className="lab-hero-chat"><span>群友：最新电视版在哪里？</span><strong>小站：已经帮你整理好了。<Check size={16}/></strong></div>}
  </section>;
}

function HeroArt({design:d,apps}:{design:LabDesign;apps:Software[]}) {
  if (['compact','index','digest'].includes(d.layout)) return <span className="lab-type-art">更新<br/><b>有序。</b></span>;
  if (['journal','folio','margin','ink','book'].includes(d.layout)) return <div className="lab-paper-art"><span>软件更新</span><i/><i/><i/><strong>新</strong></div>;
  if (['linen','petal','coast','pinboard'].includes(d.layout)) return <div className="lab-note-art"><Bookmark size={24}/><strong>重要消息<br/>别错过</strong><i/><i/></div>;
  if (['swiss','modular','asymmetric','axis','blueprint'].includes(d.layout)) return <div className="lab-grid-art"><span/><span/><span/><span/><ArrowDownToLine size={48}/></div>;
  if (['marquee','midnight','neon'].includes(d.layout)) return <div className="lab-screen-art"><span/><span/><span/><Tv size={66}/><small>软件更新中</small></div>;
  if (['command','grove','vermilion','punch'].includes(d.layout)) return <div className="lab-stack-art">{apps.slice(0,3).map(s => <span key={s.id}><SoftwareIcon software={s}/><b>{s.name}</b><small>查看新版本</small><Check size={14}/></span>)}</div>;
  if (['files','inbox','kanban','timeline','explorer'].includes(d.layout)) return <div className="lab-work-art"><div><span/><span/><span/></div>{apps.slice(0,3).map(s => <p key={s.id}><Folder size={18}/>{s.name}<ChevronRight size={13}/></p>)}</div>;
  if (d.layout === 'aurora') return <div className="lab-aurora-art"><Smartphone size={62}/><Tv size={70}/><Monitor size={58}/></div>;
  if (['feed','chat'].includes(d.layout)) return <div className="lab-message-art"><Bell size={26}/><span>软件有新消息</span><strong>更新已整理，随时来看看。</strong></div>;
  return <div className="lab-service-art"><span><ArrowDownToLine size={42}/></span><strong>找到软件<br/>选对版本</strong><ArrowRight size={24}/></div>;
}

function PinnedNotice({data,design}:{data:StationData;design:LabDesign}) {
  const notice = data.announcements.filter(n => !isExpired(n) && n.pinned).sort((a,b) => Number(b.importance === 'urgent')-Number(a.importance === 'urgent'))[0];
  if (!notice) return null;
  return <Link className="lab-pinned" href={labHref(design.id,'/announcements/'+notice.slug)}><span className="lab-pinned-icon"><Megaphone size={19}/></span><div><span className="lab-pinned-meta"><b>置顶提醒</b><time>{formatDate(notice.published_at)}</time></span><strong>{notice.title}</strong><p>{notice.summary}</p></div><ChevronRight size={19}/></Link>;
}

function SoftwareListing({data,design,query,platform,directory,adDemo,clear}:{data:StationData;design:LabDesign;query:string;platform:Platform|'all';directory:boolean;adDemo:boolean;clear:()=>void}) {
  const term = query.trim().toLocaleLowerCase();
  const apps = data.software.filter(s => (!term || [s.name,...s.aliases].some(n => n.toLocaleLowerCase().includes(term))) && (platform === 'all' || s.platforms.includes(platform)));
  const releases = data.releases.filter(r => apps.some(s => s.id === r.software_id) && (platform === 'all' || r.platform === platform)).sort((a,b) => (b.published_at || '').localeCompare(a.published_at || ''));
  const rows = directory ? apps : releases;
  const table = !directory && tableLayouts.includes(design.layout);
  const timeline = !directory && timelineLayouts.includes(design.layout);
  return <section className="lab-listing"><div className="lab-section-heading"><h2>{directory ? '全部软件' : '最新更新'}<span>{rows.length}</span></h2><span>{directory ? '选一款，查看设备与版本' : '按发布时间排列'}</span></div>
    {!rows.length ? <div className="lab-empty"><Search size={31}/><h3>没有找到对应软件</h3><p>试试软件别名，或清除设备筛选。</p><button onClick={clear}>清除搜索与筛选</button></div> : directory ? <div className="lab-directory">{apps.map(s => <Link key={s.id} className="lab-directory-card" href={labHref(design.id,'/software/'+s.slug)}><SoftwareIcon software={s}/><h3>{s.name}</h3><p>{s.summary}</p><div>{s.platforms.map(p => <span key={p}><DeviceIcon platform={p}/>{platformLabels[p]}</span>)}</div><StateLabel status={s.status}/><ChevronRight size={17}/></Link>)}</div> : <>
      {table && <div className="lab-table-heading"><span>软件 / 设备</span><span>版本</span><span>更新说明</span><span>查看</span></div>}
      {design.layout === 'kanban' ? <div className="lab-device-board">{allPlatforms.filter(p => releases.some(r => r.platform === p)).map(p => <section key={p}><header><DeviceIcon platform={p}/><h3>{platformNames[p]}</h3><span>{releases.filter(r => r.platform === p).length}</span></header>{releases.filter(r => r.platform === p).map(r => <div className="lab-board-card" key={r.id}><span>{formatDate(r.published_at)}</span><ReleaseCard release={r} software={apps.find(s => s.id === r.software_id)!} design={design}/></div>)}</section>)}</div> : <div className={`lab-updates${table ? ' lab-update-table' : ''}${timeline ? ' lab-update-timeline' : ''}`}>{releases.map((r,index) => {
        const software = apps.find(s => s.id === r.software_id)!;
        const date = formatDate(r.published_at);
        const groupStart = !index || date !== formatDate(releases[index-1].published_at);
        return <div className="lab-update-group" key={r.id}>
          {groupStart && <div className="lab-date"><span>{date}</span><span>{index === 0 ? '最近发布' : '版本记录'}</span></div>}
          <ReleaseCard release={r} software={software} design={design} first={index === 0}/>
          {adDemo && index === 2 && <PromoDemo placement="首页列表中部推广区域"/>}
        </div>;
      })}</div>}
    </>}
  </section>;
}

function ReleaseCard({release:r,software,design,first}:{release:Release;software:Software;design:LabDesign;first?:boolean}) {return <Link className={`lab-update${first ? ' lab-update-first' : ''}`} href={labHref(design.id,`/software/${software.slug}?platform=${r.platform}&release=${r.id}#version`)}><span className="lab-update-avatar"><SoftwareIcon software={software}/></span><div className="lab-update-name"><h3>{software.name}</h3><span><DeviceIcon platform={r.platform}/>{platformNames[r.platform]}</span></div><span className="lab-version">v{r.version}</span><p className="lab-update-summary">{r.summary}</p><div className="lab-update-meta"><StateLabel status={getReleaseState(software,r).status}/><time>{formatDate(r.published_at)}</time></div><span className="lab-update-action">查看更新<ChevronRight size={16}/></span></Link>;}

function StateLabel({status}:{status:string}) { return <span className={`lab-state lab-state-${status}`}><span/>{status === 'unavailable' ? '暂时无法使用' : status === 'attention' ? '需要注意' : '正常使用'}</span>; }
function PromoDemo({placement}:{placement:string}) { return <aside className="lab-promo" aria-label={placement}><span>推广 · 位置演示</span><div><Sparkles size={24}/><strong>在这里放置合作内容</strong></div><p>正式广告默认关闭。此处仅用于审查排版，与软件获取入口分开。</p></aside>; }

function SoftwareDetail({software:s,data,design,initialPlatform,initialRelease,adDemo}:{software:Software;data:StationData;design:LabDesign;initialPlatform?:string;initialRelease?:string;adDemo:boolean}) {
  const releases = data.releases.filter(r => r.software_id === s.id).sort((a,b) => (b.published_at || '').localeCompare(a.published_at || ''));
  const initial = releases.find(r => r.id === initialRelease && (!initialPlatform || r.platform === initialPlatform));
  const [platform,setPlatform] = useState<Platform>(s.platforms.includes(initialPlatform as Platform) ? initialPlatform as Platform : initial?.platform || s.platforms[0] || 'android');
  const [releaseId,setReleaseId] = useState(initial?.id || '');
  const available = releases.filter(r => r.platform === platform);
  const release = available.find(r => r.id === releaseId) || available[0];
  const state = getReleaseState(s,release);
  const links = state.status === 'unavailable' ? [] : (release?.links || []).filter(l => safeLink(l.url));
  const primary = links.find(l => l.is_primary) || links[0];
  const notices = data.announcements.filter(n => !isExpired(n) && n.software_ids.includes(s.id) && n.importance !== 'normal');
  function choose(p:Platform,r?:string) { setPlatform(p);setReleaseId(r || ''); const url = new URL(window.location.href);url.searchParams.set('platform',p);const chosen = releases.find(x => x.id === r) || releases.find(x => x.platform === p);if(chosen) url.searchParams.set('release',chosen.id);else url.searchParams.delete('release');window.history.replaceState({},'',url); }
  const noLink = state.status === 'unavailable' ? state.reason || '当前版本暂时无法使用，恢复后会在本站公告。' : '暂未配置获取链接，请等待管理员补充。';
  return <article className="lab-detail">
    <Link className="lab-back" href={labHref(design.id,'/software')}><ArrowLeft size={16}/>软件目录</Link>
    <div className="lab-detail-title"><SoftwareIcon software={s} large/><div><h1>{s.name}</h1><p>{s.summary}</p><span className="lab-demo-label">示例软件</span></div><CopyButton label="复制本页链接"/></div>
    {notices.map(n => <Link key={n.id} className="lab-inline-notice" href={labHref(design.id,'/announcements/'+n.slug)}><CircleAlert size={18}/><span>{n.title}</span><ChevronRight size={16}/></Link>)}
    <div className="lab-detail-columns"><div>
      <section className="lab-detail-panel" id="version"><h2>选择你的设备</h2><div className="lab-platforms">{s.platforms.map(p => <button key={p} onClick={() => choose(p)} aria-pressed={platform === p}><DeviceIcon platform={p} size={20}/>{platformNames[p]}</button>)}</div>
        <label className="lab-version-select">选择版本<select aria-label="选择版本" value={release?.id || ''} onChange={e => choose(platform,e.target.value)}>{available.length ? available.map((r,i) => <option key={r.id} value={r.id}>v{r.version}{i === 0 ? ' · 最新版' : ' · 历史版'} · {formatDate(r.published_at)}</option>) : <option value="">暂无发布版本</option>}</select><ChevronDown size={16}/></label>
        {release ? <><div className="lab-release-header"><div><span>{platformNames[platform]}</span><h3>v{release.version}<small>{release.id === available[0]?.id ? '最新版本' : '历史版本'}</small></h3></div><StateLabel status={state.status}/></div><p className="lab-release-date">更新日期 {formatDate(release.published_at)}</p><h2>本次更新</h2><p className="lab-release-summary">{release.summary}</p><div className="lab-prose">{release.notes.split('\n').filter(Boolean).map((line,i) => <p key={i}>{line}</p>)}</div></> : <div className="lab-empty"><h3>这个设备还没有发布版本</h3><p>可以查看其他设备，或稍后再来。</p></div>}
      </section>
      <div className="lab-mobile-get"><GetPanel primary={primary} links={links} release={release} platform={platform} noLink={noLink}/></div>
      {adDemo && <PromoDemo placement="软件详情正文推广区域"/>}
      <section className="lab-detail-panel"><h2>安装方法</h2>{s.installation.length ? <ol className="lab-steps">{s.installation.map((step,i) => <li key={i}><span>{i+1}</span><p>{step}</p></li>)}</ol> : <p>管理员尚未补充安装方法，请先阅读版本提醒。</p>}{s.screenshots.length > 0 && <div className="lab-screenshots">{s.screenshots.map((src,i) => <img key={src} src={src} alt={`安装说明截图${i+1}`} loading="lazy"/>)}</div>}</section>
      <section className="lab-detail-panel"><h2>常见问题</h2>{s.faqs.length ? s.faqs.map((faq,i) => <details className="lab-faq" key={i}><summary>{faq.question}<ChevronDown size={16}/></summary><p>{faq.answer}</p></details>) : <p>暂无常见问题，安装前请留意重要公告。</p>}</section>
      <details className="lab-history"><summary>历史版本记录<span>{Math.max(0,available.length-1)} 个版本<ChevronDown size={17}/></span></summary>{available.length > 1 ? available.slice(1).map(r => <button key={r.id} onClick={() => {choose(platform,r.id);document.getElementById('version')?.scrollIntoView({block:'start'});}}><strong>v{r.version}</strong><span>{formatDate(r.published_at)}</span><span>查看此版本<ChevronRight size={15}/></span></button>) : <p>暂无历史版本。后续更新会保留在这里。</p>}</details>
    </div><aside className="lab-detail-aside"><GetPanel primary={primary} links={links} release={release} platform={platform} noLink={noLink}/><div className="lab-side-help"><strong>在小红书内打不开？</strong><p>可以复制获取链接，再在常用浏览器中粘贴打开。没有复制权限时，可长按手动复制。</p></div>{adDemo && <PromoDemo placement="桌面侧栏推广区域"/>}</aside></div>
    <div className="lab-fixed-get"><div><strong>{platformNames[platform]} {release ? `v${release.version}` : ''}</strong><span>{primary ? primary.label : '暂未配置获取链接'}</span></div>{primary ? <a href={safeLink(primary.url)} target="_blank" rel="noopener noreferrer">{platformActions[platform]}<ExternalLink size={16}/></a> : <button disabled>暂不可获取</button>}</div>
  </article>;
}

type LinkInfo = Release['links'][number];
function GetPanel({primary,links,release,platform,noLink}:{primary?:LinkInfo;links:LinkInfo[];release?:Release;platform:Platform;noLink:string}) {
  return <section className="lab-get"><h2>获取{platformNames[platform]}版本</h2>{release?.install_notice && <div className="lab-install-notice"><CircleAlert size={17}/><p>{release.install_notice}</p></div>}{primary ? <><p className="lab-source">来源：{primary.label || new URL(primary.url).hostname}</p><a className="lab-get-primary" href={safeLink(primary.url)} target="_blank" rel="noopener noreferrer">{platformActions[platform]}<ExternalLink size={17}/></a>{primary.code && <div className="lab-code">提取码 <strong>{primary.code}</strong><CopyButton text={primary.code} label="复制提取码"/></div>}<CopyButton text={primary.url}/>{links.filter(l => l !== primary).map((l,i) => <div className="lab-backup" key={l.id || i}><a href={safeLink(l.url)} target="_blank" rel="noopener noreferrer">{l.label || '备用获取入口'}<ExternalLink size={15}/></a>{l.code && <span>提取码 {l.code}</span>}<CopyButton text={l.url}/></div>)}</> : <><div className="lab-unavailable"><CircleAlert size={23}/><strong>暂不可获取</strong><p>{noLink}</p></div><button disabled className="lab-get-primary">暂未配置获取链接</button></>}<p className="lab-get-help">请先确认设备与版本。本站不托管安装包。</p></section>;
}

function NoticeList({data,design}:{data:StationData;design:LabDesign}) { return <section className="lab-announcements"><div className="lab-page-title"><h1>群内公告</h1><p>重要提醒、使用说明与维护消息，在这里留存。</p></div>{data.announcements.map(n => <Link key={n.id} className="lab-notice-row" href={labHref(design.id,'/announcements/'+n.slug)}><span className="lab-notice-category">{n.category === 'maintenance' ? '维护通知' : n.category === 'usage' ? '使用提醒' : '群公告'}</span><div><h2>{n.title}</h2><p>{n.summary}</p><span>{formatDate(n.published_at)} <b>{isExpired(n) ? '已结束' : n.pinned ? '置顶提醒' : '有效公告'}</b></span></div><ChevronRight size={18}/></Link>)}</section>; }
function AnnouncementDetail({notice:n,data,design}:{notice:Announcement;data:StationData;design:LabDesign}) { return <article className="lab-announcement-detail"><Link className="lab-back" href={labHref(design.id,'/announcements')}><ArrowLeft size={16}/>全部公告</Link><div className="lab-page-title"><span className="lab-demo-label">示例公告 {isExpired(n) ? ' · 已结束' : ''}</span><h1>{n.title}</h1><p>{formatDate(n.published_at)}</p></div>{isExpired(n) && <div className="lab-inline-notice"><Clock3 size={18}/>本公告已结束，请以当前版本和最新公告为准。</div>}<p className="lab-notice-lead">{n.summary}</p><div className="lab-prose">{n.body.split('\n').filter(Boolean).map((line,i) => <p key={i}>{line}</p>)}</div>{n.images.map(src => <img key={src} src={src} alt="公告说明图片" loading="lazy"/>)}{n.links.filter(l => safeLink(l.url)).map((l,i) => <a key={i} className="lab-text-link" href={safeLink(l.url)} target="_blank" rel="noopener noreferrer">{l.label}<ExternalLink size={15}/></a>)}<section className="lab-related"><h2>关联软件</h2>{data.software.filter(s => n.software_ids.includes(s.id)).map(s => <Link key={s.id} href={labHref(design.id,'/software/'+s.slug)}><SoftwareIcon software={s}/><strong>{s.name}</strong><ChevronRight size={17}/></Link>)}</section><CopyButton label="复制公告链接"/></article>; }
