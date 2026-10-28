'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { createLocalStore, useLocalStore } from '@/hooks/local-store';
import { THEME_KEY, THEMES, type ThemeChoice } from '@/lib/theme';

const LABELS: Record<ThemeChoice, string> = { system: '跟随系统', light: '白天', dark: '黑夜' };

const themeStore = createLocalStore<ThemeChoice>(THEME_KEY, 'system', v => THEMES.includes(v as ThemeChoice) ? v as ThemeChoice : 'system');

export function useTheme() {
  // Hydration renders 'system'; the boot script already set the real attribute, so
  // the attribute is only written on an explicit choice to avoid a flash.
  const choice = useLocalStore(themeStore);
  const setChoice = (next: ThemeChoice) => { themeStore.set(next); document.documentElement.dataset.theme = next; };
  return { choice, setChoice };
}

function ThemeIcon({ choice }: { choice: ThemeChoice }) {
  const common = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (choice === 'light') return <svg {...common}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>;
  if (choice === 'dark') return <svg {...common}><path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/></svg>;
  return <svg {...common}><rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/></svg>;
}

/** 外观小图标：点开菜单选择 跟随系统 / 白天 / 黑夜。 */
export function ThemeToggle({ className = 'sv-ib' }: { className?: string }) {
  const { choice, setChoice } = useTheme();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === 'Escape' : !box.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close); };
  }, [open]);
  return <div className="sv-theme" ref={box}>
    <button type="button" className={className} aria-label={`外观：${LABELS[choice]}`} aria-haspopup="menu" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(v => !v)}><ThemeIcon choice={choice}/></button>
    {open && <div className="sv-theme__menu" role="menu" id={menuId} aria-label="外观">
      <span className="sv-theme__label">外观</span>
      {THEMES.map(t => <button key={t} type="button" role="menuitemradio" aria-checked={choice === t} className="sv-theme__opt" onClick={() => { setChoice(t); setOpen(false); }}><ThemeIcon choice={t}/>{LABELS[t]}</button>)}
    </div>}
  </div>;
}
