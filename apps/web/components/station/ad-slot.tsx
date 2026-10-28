'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { Promotion, Settings } from '@/lib/station-types';
import { houseAdProvider, type AdPlacement, type AdProvider } from '@/lib/advertising';
import { safeLink } from '@/lib/station';
import { track, trackOncePerSession } from '@/lib/station-events';

/* 手机端关闭的广告位只在本次会话内不再显示（R-AD-02、Q17），存 sessionStorage。 */
const CLOSED_KEY = 'bmiao:v1:ad-closed';
const closedListeners = new Set<() => void>();
let closedMemory = '[]';
function readClosed() { try { return sessionStorage.getItem(CLOSED_KEY) || closedMemory; } catch { return closedMemory; } }
function closePlacement(placement: AdPlacement) {
  const list = parseList(readClosed());
  closedMemory = JSON.stringify([...new Set([...list, placement])]);
  try { sessionStorage.setItem(CLOSED_KEY, closedMemory); } catch { /* keep in memory */ }
  closedListeners.forEach(fn => fn());
}
function parseList(raw: string): string[] { try { const v = JSON.parse(raw); return Array.isArray(v) ? v : []; } catch { return []; } }
const subscribeClosed = (fn: () => void) => { closedListeners.add(fn); return () => { closedListeners.delete(fn); }; };

export type AdVariant = 'feed' | 'wide' | 'side';

/**
 * 广告位共 6 个：首页信息流 / 首页底部横幅 / 软件库底部 / 详情正文 / 公告正文后 / 电脑侧栏。
 * 都不放在结论与下载按钮之间（R-AD-01）。
 * 总开关和按位置开关都打开、且有有效投放时才渲染；否则不留空白（R-AD-04）。
 */
export function AdSlot({ settings, promotions, placement, variant, provider = houseAdProvider }: { settings: Settings; promotions: Promotion[]; placement: AdPlacement; variant: AdVariant; provider?: AdProvider }) {
  const [, refresh] = useState(0);
  const enabled = settings.ads_enabled && settings.ad_placements?.[placement] !== false;
  const closed = useSyncExternalStore(subscribeClosed, readClosed, () => '[]');
  const promotion = enabled ? provider.select(promotions, placement) : undefined;
  // 投放到达开始 / 结束时间时重新选择，不必刷新页面。
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const next = promotions.flatMap(p => [p.starts_at, p.ends_at]).filter((v): v is string => !!v).map(v => new Date(v).getTime()).filter(v => v > now).sort((a, b) => a - b)[0];
    if (!next) return;
    const timer = setTimeout(() => refresh(v => v + 1), Math.min(next - now + 30, 2147483647));
    return () => clearTimeout(timer);
  }, [enabled, promotions, promotion]);
  if (!promotion || parseList(closed).includes(placement)) return null;
  return <AdCreative key={`${promotion.id}-${promotion.cover_url}`} promotion={promotion} placement={placement} variant={variant}/>;
}

function AdCreative({ promotion, placement, variant }: { promotion: Promotion; placement: AdPlacement; variant: AdVariant }) {
  const ref = useRef<HTMLDivElement>(null);
  const [near, setNear] = useState(false);
  const [failed, setFailed] = useState(false);
  const statKey = `${placement}:${promotion.id}`;

  useEffect(() => {
    if (failed) return;
    const element = ref.current;
    if (!element || !('IntersectionObserver' in window)) { const frame = requestAnimationFrame(() => setNear(true)); return () => cancelAnimationFrame(frame); }
    // 图片延迟加载：接近视口时才请求（R-AD-08）。
    const lazy = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setNear(true); lazy.disconnect(); } }, { rootMargin: '200px' });
    // 曝光：可见面积 ≥ 50% 且持续 ≥ 1 秒；每会话每位置一次（R-AD-06）。
    let timer: number | undefined;
    const seen = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry.intersectionRatio >= 0.5) timer = window.setTimeout(() => { trackOncePerSession('ad_imp', statKey); seen.disconnect(); }, 1000);
    }, { threshold: [0, 0.5, 1] });
    lazy.observe(element); seen.observe(element);
    return () => { lazy.disconnect(); seen.disconnect(); window.clearTimeout(timer); };
  }, [statKey, failed]);

  if (failed) return null; // 图片加载失败时整卡收起，不留破图。
  const target = safeLink(promotion.target_url);
  const content = <>
    <span className="sv-ad__img">{promotion.cover_url ? (near ? <img src={promotion.cover_url} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)}/> : null) : <span className="sv-ad__ph" aria-hidden="true">{promotion.title}</span>}</span>
    <span className="sv-ad__txt"><b>{promotion.title}</b><span>{variant === 'feed' ? `${promotion.summary ? `${promotion.summary} · ` : ''}了解详情 ›` : '了解 ›'}</span></span>
  </>;
  const onClick = () => track('ad_click', statKey);
  return <div ref={ref} className={`sv-ad sv-ad--${variant}`} data-placement={placement}>
    <span className="sv-ad__label">广告</span>
    {variant !== 'side' && <button type="button" className="sv-ad__close" aria-label="关闭广告" onClick={() => closePlacement(placement)}>✕</button>}
    {target
      ? <a className="sv-ad__link" href={target} target="_blank" rel="noopener noreferrer sponsored" onClick={onClick} aria-label={`广告：${promotion.title}`}>{content}</a>
      : <Link className="sv-ad__link" href={`/promo/${encodeURIComponent(promotion.slug)}`} onClick={onClick} aria-label={`广告：${promotion.title}`}>{content}</Link>}
  </div>;
}
