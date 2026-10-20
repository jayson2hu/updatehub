'use client';
import { useSyncExternalStore } from 'react';

/**
 * Small localStorage-backed store shared by every component that reads the same key.
 * Extracted from use-my-software.ts: useSyncExternalStore snapshots, in-memory
 * fallback when storage is blocked or full, and cross-tab sync via the storage event.
 */
export interface LocalStore<T> {
  key: string;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => boolean;
  subscribe: (callback: () => void) => () => void;
  serverSnapshot: () => T;
  /** True after a read or write failed; data then only lives until the page reloads. */
  unavailable: () => boolean;
}

export function createLocalStore<T>(key: string, fallback: T, sanitize: (value: unknown) => T = v => v as T): LocalStore<T> {
  let memory: string | null = null;
  let storageUnavailable = false;
  let cachedRaw: string | null | undefined;
  let cachedValue: T = fallback;
  const listeners = new Set<() => void>();

  function readRaw(): string | null {
    if (typeof window === 'undefined') return null;
    if (!storageUnavailable) {
      try { return window.localStorage.getItem(key); }
      catch { storageUnavailable = true; }
    }
    return memory;
  }

  // Snapshot must be referentially stable until the raw string changes.
  function get(): T {
    const raw = readRaw();
    if (raw !== cachedRaw) {
      cachedRaw = raw;
      if (raw === null) cachedValue = fallback;
      else { try { cachedValue = sanitize(JSON.parse(raw)); } catch { cachedValue = fallback; } }
    }
    return cachedValue;
  }

  function emit() { listeners.forEach(listener => listener()); }

  function set(next: T | ((prev: T) => T)) {
    const value = typeof next === 'function' ? (next as (prev: T) => T)(get()) : next;
    const raw = JSON.stringify(value);
    memory = raw;
    if (!storageUnavailable) {
      try { window.localStorage.setItem(key, raw); }
      catch { storageUnavailable = true; } // Stop reading stale persistent data; keep the in-memory copy.
    }
    emit();
    return !storageUnavailable;
  }

  function onStorage(event: StorageEvent) { if (event.key === key || event.key === null) emit(); }

  function subscribe(callback: () => void) {
    if (listeners.size === 0) window.addEventListener('storage', onStorage);
    listeners.add(callback);
    return () => {
      listeners.delete(callback);
      if (listeners.size === 0) window.removeEventListener('storage', onStorage);
    };
  }

  const serverSnapshot = () => fallback;
  return {
    key, get, set, subscribe, serverSnapshot,
    unavailable: () => storageUnavailable,
  };
}

/** Subscribe a component to a store. Server render and hydration use the fallback value. */
export function useLocalStore<T>(store: LocalStore<T>): T {
  return useSyncExternalStore(store.subscribe, store.get, store.serverSnapshot);
}

/* ---------- sanitizers ---------- */
export const stringList = (max: number) => (value: unknown): string[] =>
  Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && v.length > 0 && v.length <= 200))].slice(0, max) : [];

export function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter((e): e is [string, string] => typeof e[1] === 'string').slice(0, 500));
}

export function objectList<T>(max: number, valid: (item: Record<string, unknown>) => boolean) {
  return (value: unknown): T[] => Array.isArray(value) ? value.filter((v): v is Record<string, unknown> => !!v && typeof v === 'object' && valid(v as Record<string, unknown>)).slice(0, max) as T[] : [];
}
