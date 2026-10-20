import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ApiError } from '@/lib/api';
import { getStationPromotion, isPromotionActive, isPromotionEnded, safeLink } from '@/lib/station';
import { monthDay } from '@/lib/station-view';

export const metadata: Metadata = { title: '广告' };

export default async function PromoPage({ params }: { params: Promise<{ slug: string }> }) {
  let p;
  try { p = await getStationPromotion((await params).slug); }
  catch (e) { if (e instanceof ApiError && e.status === 404) notFound(); throw e; }
  const active = isPromotionActive(p), ended = isPromotionEnded(p);
  const target = safeLink(p.target_url);
  return <div className="sv-container sv-article-wrap">
    <article className="sv-article">
      <p className="sv-ann-card__meta"><span className="sv-tag sv-tag--gray">广告</span><span className="sv-u-xs sv-u-muted">{active ? '进行中' : ended ? '已结束' : '尚未开始'}{p.ends_at && ` · 到 ${monthDay(p.ends_at)}`}</span></p>
      <h1>{p.title}</h1>
      {p.cover_url && <img className="sv-article__img" src={p.cover_url} alt=""/>}
      {p.summary && <p className="sv-article__lead">{p.summary}</p>}
      <div className="sv-article__body">{p.body.split('\n').filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}</div>
      {active && target && <p className="sv-u-mt16"><a className="sv-btn sv-btn--soft sv-btn--block" href={target} target="_blank" rel="noopener noreferrer sponsored">{p.action_label || '了解详情'} ↗</a></p>}
      <p className="sv-u-mt8"><Link className="sv-btn sv-btn--ghost sv-btn--block" href="/">回首页</Link></p>
    </article>
  </div>;
}
