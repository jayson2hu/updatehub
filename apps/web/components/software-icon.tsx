'use client';
import { useState } from 'react';
import { AppWindow } from 'lucide-react';
export function SoftwareIcon({ name, src, size = 48 }: { name: string; src: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  return <span className="software-icon" style={{ width: size, height: size }}>{src && !failed ? <img src={src} alt={`${name} 图标`} width={size} height={size} loading="lazy" onError={() => setFailed(true)} /> : <AppWindow size={size * .65} aria-label={`${name} 图标`} />}</span>;
}
