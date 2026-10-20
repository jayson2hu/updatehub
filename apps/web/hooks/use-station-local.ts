'use client';
// Visitor data kept only on this device (NFR-PRIV-04). Keys use the bmiao:v1:* namespace.
import { useMemo } from 'react';
import type { IssueKind, Platform } from '@/lib/station-types';
import { createLocalStore, objectList, stringList, stringRecord, useLocalStore } from './local-store';
import { track } from '@/lib/station-events';
import { isPlatform } from '@/lib/station-view';

export interface FeedbackRecord { releaseId: string; softwareId: string; name: string; version: string; platform: Platform; verdict: 'ok' | 'issue'; kind?: IssueKind; at: string; receipt?: string; oks?: number; issues?: number }
export interface WishRecord { id?: string; name: string; platforms: Platform[]; status: string; votes: number; at: string; software_slug?: string | null }
export interface SyncRecord { code: string; expiresAt: string; count: number; fingerprint?: string }

export const syncFingerprint = (ids: string[], device: string) => JSON.stringify([[...new Set(ids)].sort(), device]);

export const favoritesStore = createLocalStore<string[]>('bmiao:v1:favorites', [], stringList(500));
/** 软件 id → 上次查看时该软件最新版本的发布时间（R-GLOBAL-08）。 */
export const seenStore = createLocalStore<Record<string, string>>('bmiao:v1:seen', {}, stringRecord);
export const recentStore = createLocalStore<string[]>('bmiao:v1:recent', [], stringList(6));
export const deviceStore = createLocalStore<Platform | ''>('bmiao:v1:device', '', v => isPlatform(v) ? v : '');
export const feedbackStore = createLocalStore<FeedbackRecord[]>('bmiao:v1:feedback', [], objectList<FeedbackRecord>(200, v => typeof v.releaseId === 'string' && (v.verdict === 'ok' || v.verdict === 'issue')));
export const searchesStore = createLocalStore<string[]>('bmiao:v1:searches', [], stringList(10));
export const wishesStore = createLocalStore<WishRecord[]>('bmiao:v1:wishes', [], objectList<WishRecord>(50, v => typeof v.name === 'string'));
export const remindStore = createLocalStore<boolean>('bmiao:v1:remind', true, v => v !== false);
export const syncStore = createLocalStore<SyncRecord | null>('bmiao:v1:sync', null, v => v && typeof v === 'object' && typeof (v as SyncRecord).code === 'string' ? v as SyncRecord : null);

/* ---------- 收藏与已读 ---------- */
export function markSeen(ids: string[], latest: Record<string, string>) {
  seenStore.set(prev => { const next = { ...prev }; for (const id of ids) if (latest[id]) next[id] = latest[id]; return next; });
}
/** 切换收藏并上报 fav_add / fav_remove；新收藏立即视为已读。返回切换后是否已收藏。 */
export function toggleFavorite(id: string, latest: Record<string, string>) {
  const on = favoritesStore.get().includes(id);
  favoritesStore.set(prev => on ? prev.filter(v => v !== id) : [id, ...prev.filter(v => v !== id)]);
  if (!on) markSeen([id], latest);
  track(on ? 'fav_remove' : 'fav_add', id);
  return !on;
}
/** 同步码恢复：合并收藏，新增的上报 fav_add 并视为已读。返回新增数量。 */
export function mergeFavorites(ids: string[], latest: Record<string, string>) {
  const current = favoritesStore.get();
  const added = ids.filter(id => !current.includes(id));
  if (added.length) {
    favoritesStore.set(prev => [...prev, ...added.filter(id => !prev.includes(id))]);
    markSeen(added, latest);
    added.forEach(id => track('fav_add', id));
  }
  return added.length;
}
export function pushRecent(id: string) { recentStore.set(prev => [id, ...prev.filter(v => v !== id)].slice(0, 6)); }
export function pushSearch(q: string) { const v = q.trim().slice(0, 30); if (v) searchesStore.set(prev => [v, ...prev.filter(x => x !== v)].slice(0, 10)); }

/** 有新版的收藏（提醒开关关闭时为空）。 */
export function useNewFavorites(latest: Record<string, string>) {
  const favorites = useLocalStore(favoritesStore);
  const seen = useLocalStore(seenStore);
  const remind = useLocalStore(remindStore);
  return useMemo(() => remind ? favorites.filter(id => latest[id] && seen[id] && latest[id] > seen[id]) : [], [favorites, seen, remind, latest]);
}
