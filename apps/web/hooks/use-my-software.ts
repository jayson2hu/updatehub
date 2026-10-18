'use client';
import { useMemo, useSyncExternalStore } from 'react';

const key = 'updatehub:my-software:v1';
const event = 'updatehub:software-changed';
let fallback = '[]';
let storageUnavailable = false;

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener(event, callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener(event, callback);
  };
}

function snapshot() {
  if (!storageUnavailable) {
    try { fallback = localStorage.getItem(key) || '[]'; }
    catch { storageUnavailable = true; }
  }
  return `${storageUnavailable ? 'session' : 'saved'}:${fallback}`;
}

function parse(raw: string): string[] {
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string').slice(0, 500) : [];
  } catch { return []; }
}

function currentIds() { const raw = snapshot(); return parse(raw.slice(raw.indexOf(':') + 1)); }

function save(ids: string[]) {
  fallback = JSON.stringify(ids);
  try {
    localStorage.setItem(key, fallback);
    storageUnavailable = false;
  } catch {
    // Stop reading stale persistent data after a write failure. All subscribers
    // share this in-memory list until a later write succeeds or the page reloads.
    storageUnavailable = true;
  }
  window.dispatchEvent(new Event(event));
  return !storageUnavailable;
}

export function useMySoftware() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => 'saved:[]');
  const ids = useMemo(() => parse(raw.slice(raw.indexOf(':') + 1)), [raw]);
  return {
    ids,
    storageUnavailable: raw.startsWith('session:'),
    contains: (id: string) => ids.includes(id),
    follow: (id: string) => save([...new Set([...currentIds(), id])]),
    followMany: (nextIds: string[]) => save([...new Set([...currentIds(), ...nextIds])].slice(0, 500)),
    unfollow: (id: string) => save(currentIds().filter(value => value !== id)),
    clear: () => save([]),
  };
}
