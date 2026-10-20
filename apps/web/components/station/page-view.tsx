'use client';
import { useEffect } from 'react';
import { track, type PageName } from '@/lib/station-events';

/** 进入页面上报一次 page_view（站内跳转也计，数据口径 §7.1）。 */
export function PageView({ name }: { name: PageName }) {
  useEffect(() => { track('page_view', name); }, [name]);
  return null;
}
