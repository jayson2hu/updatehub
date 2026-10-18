'use client';
import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/** Count a rendered search, never server rendering or link prefetching. */
export function SearchTracker({ query, total, scope }: { query: string; total: number; scope: 'software' | 'updates' | 'guides' | 'faq' | 'collections' }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const location = `${pathname}?${params}`;
  useEffect(() => {
    if (!query.trim()) return;
    let sent = false;
    const send = () => {
      if (sent || document.visibilityState !== 'visible') return;
      sent = true;
      void fetch('/api/v1/analytics/events', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: 'search', query, result_count: total, scope }),
        keepalive: true,
      }).catch(() => { /* Measurement must never block the user's task. */ });
    };
    const timer = window.setTimeout(send, 350);
    document.addEventListener('visibilitychange', send);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', send); };
  }, [query, total, scope, location]);
  return null;
}
