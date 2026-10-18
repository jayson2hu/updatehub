import { cache } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { ArrowLeft, ArrowRight, ArrowUpRight, ChevronRight, Pin, Users, CheckCircle2, Info, ShieldCheck, History } from 'lucide-react';
import { api, ApiError, getSiteSettings } from '@/lib/server-api';
import type { ReleaseUpdate } from '@/lib/types';
import { announcementDate, announcementKinds, announcementLevel, siteUrl } from '@/lib/format';
import { getCurrentRelease, primaryOfficialLink, officialLinkLabel } from '@/lib/releases';
import { isHistoricalRelease } from '@/lib/release-status';
import { SoftwareIcon } from '@/components/software-icon';
import { FollowButton } from '@/components/follow-button';
import { CopyAnnouncementLink } from '@/components/updates/copy-link';
import { VersionHistory, type HistoryParams } from '@/components/updates/version-history';

const getUpdate = cache(async (slug: string) => {
  try { return await api<ReleaseUpdate>(`/updates/${encodeURIComponent(slug)}`); }
  catch(error) { if(error instanceof ApiError && error.status===404) notFound(); throw error; }
});
export async function generateMetadata({params}:{params:Promise<{slug:string}>}):Promise<Metadata> {
  const {slug} = await params; const u = await getUpdate(slug);
  return {title:u.title,description:u.summary,alternates:{canonical:`/update/${u.slug}`},robots:{index:!u.is_demo,follow:true},openGraph:{title:u.title,description:u.summary,type:'article',publishedTime:u.published_at||undefined,modifiedTime:u.updated_at}};
}
export default async function UpdateDetail({params,searchParams}:{params:Promise<{slug:string}>;searchParams:Promise<HistoryParams>}) {
  const {slug} = await params; const u = await getUpdate(slug);
  const [settings, historyParams, current] = await Promise.all([getSiteSettings(), searchParams, u.software ? getCurrentRelease(u.software.slug) : Promise.resolve(null)]);
  const source = u.software ? primaryOfficialLink(u.software) : undefined;
  const historical = isHistoricalRelease(u);
  const sourceUrl = u.official_release_url || (source ? `/go/${source.id}` : null);
  const sourceLabel = u.official_release_url ? u.kind === 'release' ? '查看官方 Release' : '查看官方来源' : officialLinkLabel(source?.type || 'website');
  const schema = {'@context':'https://schema.org','@type':'Article',headline:u.title,description:u.summary,datePublished:u.published_at,dateModified:u.updated_at,articleSection:announcementKinds[u.kind],author:{'@type':'Organization',name:settings.site_name},url:`${siteUrl()}/update/${u.slug}`};

  return <div className="page-container announcement-detail announcement-workspace">
    <script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify(schema).replace(/</g,'\\u003c')}}/>
    <nav className="breadcrumbs" aria-label="面包屑"><Link href="/">公告中心</Link><ChevronRight size={13}/>{u.software && <><Link href={`/software/${u.software.slug}`}>{u.software.short_name || u.software.name}</Link><ChevronRight size={13}/></>}<span>{announcementKinds[u.kind]}</span></nav>
    <header id="announcement-start" className="announcement-detail-heading">
      <div className="announcement-meta">{u.is_pinned && <span className="pin-label"><Pin size={13}/>置顶</span>}<span className={`notice-kind ${u.kind}`}>{announcementKinds[u.kind]}</span>{historical ? <span className="history-recorded-label">历史版本公告</span> : <span className={`status-badge ${u.update_level}`}>{announcementLevel(u.kind,u.update_level)}</span>}{u.is_demo && <span className="announcement-demo-label">演示公告</span>}</div>
      <h1>{u.title}</h1><p>{u.summary}</p>
      <div className="announcement-byline"><span>{settings.site_name}发布</span><time dateTime={u.published_at||undefined}>{announcementDate(u.published_at,true)}</time>{u.official_release_date && <span>{u.is_demo ? '演示发布日期' : '官方发布日期'}：{u.official_release_date}</span>}</div>
    </header>
    {historical && u.software && <section className="historical-reading-notice" aria-label="历史版本提示"><History size={22}/><div><strong>你正在阅读 {u.version} 的历史公告</strong><p>下面保留的是这个版本当时的建议。软件当前记录为 <b>{u.software.latest_version || '暂未确认'}</b>。</p><Link href={current ? `/update/${current.slug}` : `/software/${u.software.slug}`} className="button button-secondary">{current ? '查看当前版本公告' : '查看当前软件资料'}<ArrowRight size={16}/></Link></div></section>}
    {u.is_demo && <div className="notice notice-demo"><Info size={19}/><p><strong>演示公告，请勿作为实际操作依据</strong>版本、变化和建议均用于演示，请核对真实官方说明后再操作。</p></div>}
    <div className="announcement-quick-actions">
      {u.software && <Link href={`/software/${u.software.slug}`} className="announcement-software-link"><SoftwareIcon name={u.software.name} src={u.software.icon_url} size={32}/><span>{u.software.short_name || u.software.name}<small>软件资料与版本记录</small></span></Link>}
      <div>{sourceUrl && <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="button button-primary quick-official">{sourceLabel}<ArrowUpRight size={16}/></a>}{u.software && <FollowButton id={u.software.id} name={u.software.name}/>}<CopyAnnouncementLink slug={u.slug}/></div>
    </div>
    <nav className="detail-section-nav" aria-label="公告详情栏目"><a href="#announcement-content">公告内容</a>{u.software && <a href="#version-history">版本历史</a>}{sourceUrl && <a href="#official-sources">官方来源</a>}</nav>
    <div className="announcement-article-layout"><article id="announcement-content" className="announcement-article">
      <section className={`announcement-decision ${u.update_level}`}><div><CheckCircle2 size={21}/><h2>{historical ? '当时的更新建议' : '你需要做什么'}</h2></div><p>{u.reason_to_update}</p>{historical && <span className={`status-badge ${u.update_level}`}>{announcementLevel(u.kind,u.update_level)}</span>}</section>
      <section className="announcement-impact"><div><Users size={18}/><h2>影响范围</h2></div><p>{u.who_should_update}</p>{u.who_can_wait && <div className="can-wait"><strong>可以暂缓的情况</strong><p>{u.who_can_wait}</p></div>}</section>
      {u.kind==='release' && <section className="content-section announcement-version-section"><div className="section-heading"><h2>本次版本变化</h2>{u.software && <a className="text-link" href="#version-history">查看版本历史 <ArrowRight size={14}/></a>}</div><div>{u.previous_version && <><span>{u.previous_version}</span><ArrowRight size={20}/></>}<strong>{u.version}</strong>{!u.previous_version && <small>未提供上一版本记录</small>}</div></section>}
      {u.changes.length>0 && <section className="content-section"><h2>主要变化</h2><ul className="announcement-changes">{u.changes.map((change,index)=><li key={index}>{change}</li>)}</ul></section>}
      <section className="content-section"><h2>公告说明</h2><p className="long-text">{u.content}</p></section>
      {u.known_issues && <section className="content-section"><h2>已知问题</h2><p className="long-text">{u.known_issues}</p></section>}
      {u.notes && <section className="content-section"><h2>注意事项</h2><p className="long-text">{u.notes}</p></section>}
      <p className="announcement-revised">最近修订：{announcementDate(u.updated_at,true)}</p>
      {u.software && <VersionHistory software={u.software} currentUpdate={u} page={historyParams.history_page} base={`/update/${u.slug}`}/>}
      <Link className="text-link" href="/updates"><ArrowLeft size={15}/>返回全部公告</Link>
    </article><aside className="announcement-detail-aside">
      <section id="official-sources" className="announcement-sources"><div className="aside-heading"><ShieldCheck size={20}/><h2>官方来源</h2></div><p>{historical ? '这是该历史公告引用的来源，当前版本信息请查看软件资料。' : '核对版本、系统要求与完整发布说明。'}</p>{sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="button button-primary">{sourceLabel}<ArrowUpRight size={16}/></a> : <p>这条公告暂未提供外部来源。</p>}{u.official_release_url && source && <a href={`/go/${source.id}`} target="_blank" rel="noopener noreferrer" className="button button-secondary">{officialLinkLabel(source.type)}<ArrowUpRight size={16}/></a>}<small>在新标签页打开官方渠道。本站不提供安装包。</small></section>
      {u.software && <section className="announcement-current-aside"><h2>软件当前记录</h2><strong>{u.software.latest_version || '暂未收录'}</strong>{u.software.is_demo && <span className="announcement-demo-label">演示版本</span>}<p>{u.software.update_reason || '暂未填写当前建议。'}</p><Link href={current ? `/update/${current.slug}` : `/software/${u.software.slug}`} className="text-link">{current ? '阅读当前版本公告' : '查看软件资料'}<ArrowRight size={15}/></Link></section>}
    </aside></div>
  </div>;
}
