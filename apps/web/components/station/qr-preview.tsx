'use client';
import dynamic from 'next/dynamic';
import { useSyncExternalStore } from 'react';

// QR encoding is only needed for desktop scanning or an opened share sheet.
const QrSvg = dynamic(() => import('./qr').then(module => module.QrSvg), {
  ssr: false,
  loading: () => <span className="sv-qr__svg" aria-label="正在生成二维码" role="status"/>,
});
const query = '(min-width: 768px)';
function subscribe(callback: () => void) {
  const media = window.matchMedia(query);
  media.addEventListener('change', callback);
  return () => media.removeEventListener('change', callback);
}
export function QrPreview({ desktopOnly = false, ...props }: { text: string; label: string; className?: string; desktopOnly?: boolean }) {
  const desktop = useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
  if (desktopOnly && !desktop) return <span className="sv-qr__svg" aria-hidden="true"/>;
  return <QrSvg {...props}/>;
}
