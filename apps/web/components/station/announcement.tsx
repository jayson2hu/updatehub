'use client';
import { useEffect } from 'react';
import { trackDaily } from '@/lib/station-events';
import { useStationUi } from './ui';

/** 公告看过：本地当天去重后上报 ann_view（数据口径 §7.7）。 */
export function AnnouncementTracker({ id }: { id: string }) {
  useEffect(() => { trackDaily('ann_view', id); }, [id]);
  return null;
}

export function CopyPageLink({ label, ok, className = 'sv-btn sv-btn--ghost sv-btn--block' }: { label: string; ok: string; className?: string }) {
  const { copy } = useStationUi();
  return <button type="button" className={className} onClick={() => copy(window.location.href, ok)}>{label}</button>;
}
