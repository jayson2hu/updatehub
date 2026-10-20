'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { AdPlacementKey, DashboardData, StationData } from '@/lib/station-types';
import { slotLabels } from './workbench';
import { errorText } from './common';
import { changed } from './publishing';
export function AdOverview({ data, reload }: { data: StationData; reload: () => void }) {
  const [stats, setStats] = useState<DashboardData | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState('');
  useEffect(() => { let active = true; api<DashboardData>('/admin/station/dashboard').then(v => active && setStats(v)).catch(e => active && setError(errorText(e))); return () => { active = false; }; }, []);
  async function toggle(key: AdPlacementKey) { setBusy(key); setError(''); try { await api('/admin/station/settings', { method: 'PATCH', body: JSON.stringify({ ad_placements: { ...data.settings.ad_placements, [key]: data.settings.ad_placements?.[key] === false } }) }); changed(); reload(); } catch (e) { setError(errorText(e)); } finally { setBusy(''); } }
  return <>{error && <p className="sa-alert sa-error" role="alert">{error}</p>}<div className="sa-ad-slots">{(Object.keys(slotLabels) as AdPlacementKey[]).map(key => { const s = stats?.ads.find(v => v.placement === key); const current = data.promotions.filter(p => p.placements.includes(key) && p.published); return <section className="sa-panel" key={key}><div className="sa-section-heading"><strong>{slotLabels[key]}</strong><button className="sa-switch" role="switch" aria-label={`${slotLabels[key]}开关`} aria-checked={data.settings.ad_placements?.[key] !== false} disabled={busy === key} onClick={() => toggle(key)}><i/></button></div><small>{key === 'home_feed' ? '手机 + 电脑 · 建议 1:1 素材' : key === 'detail_body' ? '手机 · 建议 750 × 220' : '电脑 · 建议 300 × 250'}</small><div className="sa-ad-stats">{s?.impressions || 0} <small>曝光 · {s?.clicks || 0} 点击 · {s?.impressions ? (s.clicks / s.impressions * 100).toFixed(1) : '0.0'}% 点击率</small></div><small>近 7 天 · 当前 {current.length} 条已上线素材</small>{current.slice(0, 2).map(p => <p className="sa-muted" key={p.id}>{p.title}</p>)}</section>; })}</div></>;
}
