'use client';
import { useEffect, useRef, useState } from 'react';
import { StationLink as Link } from './design-context';
import type { Promotion } from '@/lib/station-types';
import { houseAdProvider, type AdPlacement, type AdProvider } from '@/lib/advertising';

export function AdSlot({ enabled, promotions, placement, provider = houseAdProvider }: { enabled: boolean; promotions: Promotion[]; placement: AdPlacement; provider?: AdProvider }) {
  const [revision, refresh] = useState(0);
  const promotion = enabled ? provider.select(promotions, placement) : undefined;
  useEffect(() => {
    if (!enabled) return;
    const now = Date.now();
    const nextBoundary = promotions.flatMap(p => [p.starts_at, p.ends_at]).filter((v): v is string => !!v).map(v => new Date(v).getTime()).filter(v => v > now).sort((a, b) => a - b)[0];
    if (!nextBoundary) return;
    const timer = setTimeout(() => refresh(value => value + 1), Math.min(nextBoundary - now + 30, 2147483647));
    return () => clearTimeout(timer);
  }, [enabled, promotions, promotion, revision]);
  if (!promotion) return null;
  return <PromotionCreative key={`${promotion.id}-${promotion.cover_url}`} promotion={promotion}/>;
}
function PromotionCreative({ promotion }: { promotion: Promotion }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false); const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!ref.current) return;
    if (!('IntersectionObserver' in window)) { const frame = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(frame); }
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } }, { rootMargin: '200px' });
    observer.observe(ref.current); return () => observer.disconnect();
  }, []);
  if (failed) return null;
  return <div ref={ref} className="st-ad-slot"><Link href={`/promo/${promotion.slug}`} aria-label={`推广：${promotion.title}`}><span className="st-label">推广</span>{promotion.cover_url && (visible ? <img src={promotion.cover_url} alt="" loading="lazy" onError={() => setFailed(true)}/> : <span className="st-ad-image" aria-hidden="true"/>)}<strong>{promotion.title}</strong><p>{promotion.summary}</p><span className="st-promo-action">了解活动</span></Link></div>;
}
