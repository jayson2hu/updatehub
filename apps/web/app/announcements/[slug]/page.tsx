import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getStationAnnouncement, getStationData, isExpired, requestNow, safeLink } from '@/lib/station';
import { announcementTypes, annTypeTone, isPinnedNow, latestBySoftware, monthDay, softwarePath } from '@/lib/station-view';
import { AnnouncementTracker, CopyPageLink } from '@/components/station/announcement';
import { PageView } from '@/components/station/page-view';
import { AdviceTag, SoftIcon } from '@/components/station/ui';
import { AdSlot } from '@/components/station/ad-slot';
import { CatMark } from '@/components/station/cat';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const { slug } = await params;
    const n = await getStationAnnouncement(slug);
    return { title: n.title, description: n.summary, alternates: { canonical: `/announcements/${encodeURIComponent(slug)}` }, openGraph: { type: 'article', title: n.title, description: n.summary, ...(n.published_at ? { publishedTime: n.published_at } : {}) } };
  } catch { return { title: '公告详情' }; }
}

/** 正文：空行分段；以「- 」「• 」开头的连续行显示为列表（R-ANN-03）。纯文本渲染，不解析 HTML。 */
function Body({ text }: { text: string }) {
  const blocks = text.split(/\n\s*\n/).map(b => b.split('\n').map(l => l.trim()).filter(Boolean)).filter(b => b.length);
  return <div className="sv-article__body">{blocks.map((lines, i) => lines.every(l => /^[-•*]\s+/.test(l))
    ? <ul key={i}>{lines.map((l, j) => <li key={j}>{l.replace(/^[-•*]\s+/, '')}</li>)}</ul>
    : <p key={i}>{lines.map((l, j) => <span key={j}>{j > 0 && <br/>}{l}</span>)}</p>)}</div>;
}

export default async function AnnouncementPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  let notice;
  try { notice = await getStationAnnouncement(slug); }
  catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const data = await getStationData();
  const now = requestNow();
  const ended = isExpired(notice, now);
  const latest = latestBySoftware(data.releases);
  const related = data.software.filter(s => notice.software_ids.includes(s.id) && s.published !== false);
  const links = notice.links.filter(l => safeLink(l.url));
  return <div className="sv-container sv-article-wrap">
    <PageView name="announcement"/><AnnouncementTracker id={notice.id}/>
    <nav className="sv-crumbs" aria-label="面包屑"><Link href="/announcements">群公告</Link><span aria-hidden="true"> › </span><span aria-current="page">详情</span></nav>
    <article className="sv-article">
      <p className="sv7-author"><CatMark size={40}/><span><b>群主</b><span className="sv-u-xs sv-u-muted">{monthDay(notice.published_at)} 在群里说</span></span></p>
      {ended && <p className="sv-oldnote">这条公告已结束，内容仅供参考。</p>}
      <p className="sv-ann-card__meta">
        {isPinnedNow(notice, now) && <span className="sv-tag sv-tag--gold">📌 置顶</span>}
        <span className={`sv-tag sv-tag--${annTypeTone(notice)}`}>{notice.importance !== 'normal' ? `重要 · ${announcementTypes[notice.category]}` : announcementTypes[notice.category]}</span>
        {ended && <span className="sv-tag sv-tag--gray">已结束</span>}{notice.is_demo && <span className="sv-tag sv-tag--gray">示例公告</span>}
        <span className="sv-u-xs sv-u-muted">{monthDay(notice.published_at)}发布{notice.expires_at && ` · 有效期到 ${monthDay(notice.expires_at)}`} · {notice.view_count || 0} 人看过</span>
      </p>
      <h1>{notice.title}</h1>
      {notice.summary && <p className="sv-article__lead">{notice.summary}</p>}
      <Body text={notice.body}/>
      {notice.images.map((url, i) => <img className="sv-article__img" src={url} alt={`公告配图 ${i + 1}`} key={url} loading="lazy"/>)}
      {links.map((l, i) => <p key={i}><a className="sv-link" href={safeLink(l.url)} target="_blank" rel="noopener noreferrer">{l.label || l.url} ↗</a></p>)}
      {related.length > 0 && <section aria-labelledby="sv-ann-soft" className="sv-u-mt18">
        <div className="sv-sh"><h2 id="sv-ann-soft">相关软件</h2></div>
        {related.map(s => { const r = latest.get(s.id); return <Link key={s.id} href={softwarePath(s.slug, r?.platform)} className="sv-result">
          <SoftIcon software={s} size="sm"/>
          <span className="sv-u-grow"><b>{s.name}</b><span className="sv-u-xs sv-u-muted sv-mono sv-u-block">{r ? `${r.version} · ${monthDay(r.published_at)}` : '暂无版本'}</span></span>
          {r && <AdviceTag advice={r.advice}/>}
        </Link>; })}
      </section>}
      <div className="sv-u-mt16"><CopyPageLink label="🔗 复制公告链接" ok="公告链接已复制"/></div>
    </article>
    <div className="sv-sec"><AdSlot settings={data.settings} promotions={data.promotions} placement="announcement_bottom" variant="wide"/></div>
  </div>;
}
