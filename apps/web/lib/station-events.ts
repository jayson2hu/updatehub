'use client';
// Anonymous, aggregated usage events (docs/v4/03 §3.2). Events are queued and sent in
// batches of ≤30 when the browser is idle, or with sendBeacon/keepalive when the page
// is hidden. Failures are dropped silently (NFR-PERF-04). No visitor id is ever sent.
import { dayKey } from './station-view';

export type PageName = 'home' | 'library' | 'detail' | 'announcements' | 'announcement' | 'search' | 'me';
export type StationEvent = 'page_view' | 'release_view' | 'sw_view' | 'fav_add' | 'fav_remove' | 'dl_copy' | 'ann_view' | 'ad_imp' | 'ad_click' | 'search' | 'search_miss';
interface QueuedEvent { event: StationEvent; key: string }

const ENDPOINT = '/api/v1/station/events';
const BATCH = 30;
const DAILY_KEY = 'bmiao:v1:daily-events';
const SESSION_KEY = 'bmiao:v1:session-events';
let queue: QueuedEvent[] = [];
let scheduled = false;
let listening = false;
const sessionMemory = new Set<string>();

function send(events: QueuedEvent[], beacon: boolean) {
  for (let i = 0; i < events.length; i += BATCH) {
    const body = JSON.stringify({ events: events.slice(i, i + BATCH) });
    try {
      if (beacon && navigator.sendBeacon?.(ENDPOINT, new Blob([body], { type: 'application/json' }))) continue;
      void fetch(ENDPOINT, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'same-origin' }).catch(() => undefined);
    } catch { /* statistics must never break the page */ }
  }
}

function flush(beacon = false) {
  scheduled = false;
  if (!queue.length) return;
  const events = queue; queue = [];
  send(events, beacon);
}

function schedule() {
  if (!listening) {
    listening = true;
    // Deliver whatever is left when the tab is hidden or closed.
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(true); });
    window.addEventListener('pagehide', () => flush(true));
  }
  if (scheduled) return;
  scheduled = true;
  const idle = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }).requestIdleCallback;
  if (idle) idle(() => flush(), { timeout: 3000 }); else window.setTimeout(() => flush(), 1500);
}

export function track(event: StationEvent, key: string) {
  if (typeof window === 'undefined' || !key) return;
  queue.push({ event, key: key.slice(0, 80) });
  if (queue.length >= BATCH) flush(); else schedule();
}

/** 本地当天去重（北京时间自然日），用于 sw_view 和 ann_view（数据口径 §7.2、§7.7）。 */
export function trackDaily(event: StationEvent, key: string) {
  if (typeof window === 'undefined') return;
  const today = dayKey(Date.now()), id = `${event}:${key}`;
  let record: { day: string; keys: string[] } = { day: today, keys: [] };
  try {
    const saved = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null');
    if (saved?.day === today && Array.isArray(saved.keys)) record = saved;
  } catch { /* storage blocked: fall back to session dedupe */ }
  if (record.keys.includes(id) || sessionMemory.has(`daily:${today}:${id}`)) return;
  record.keys = [...record.keys, id].slice(-500);
  sessionMemory.add(`daily:${today}:${id}`);
  try { localStorage.setItem(DAILY_KEY, JSON.stringify(record)); } catch { /* ignore */ }
  track(event, key);
}

/** 本次会话内只报一次（广告曝光：每会话每位置一次）。 */
export function trackOncePerSession(event: StationEvent, key: string) {
  if (typeof window === 'undefined') return;
  const id = `${event}:${key}`;
  let keys: string[] = [];
  try { keys = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]'); if (!Array.isArray(keys)) keys = []; } catch { keys = []; }
  if (keys.includes(id) || sessionMemory.has(id)) return;
  sessionMemory.add(id);
  try { sessionStorage.setItem(SESSION_KEY, JSON.stringify([...keys, id].slice(-200))); } catch { /* ignore */ }
  track(event, key);
}
