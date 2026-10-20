'use client';
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Advice, Platform, Settings, Software } from '@/lib/station-types';
import { adviceMeta, platformEmoji, platformFull, platformShort, type InApp } from '@/lib/station-view';

/* ================= 站点上下文 ================= */
interface StationUi {
  settings: Settings;
  inApp: InApp;
  /** 每款软件最新版本的发布时间（红点判定）。 */
  latest: Record<string, string>;
  toast: (message: string) => void;
  copy: (text: string, ok: string) => Promise<boolean>;
  openGuide: () => void;
}
const UiContext = createContext<StationUi | null>(null);
export function useStationUi() {
  const value = useContext(UiContext);
  if (!value) throw new Error('useStationUi must be used inside <StationUiProvider>');
  return value;
}

async function writeClipboard(text: string) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path used by some in-app browsers */ }
  try {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.position = 'fixed'; area.style.opacity = '0';
    document.body.appendChild(area); area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch { return false; }
}

export function StationUiProvider({ settings, inApp, latest, children }: { settings: Settings; inApp: InApp; latest: Record<string, string>; children: ReactNode }) {
  const [message, setMessage] = useState<{ text: string; id: number } | null>(null);
  const [manual, setManual] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((text: string) => {
    window.clearTimeout(timer.current);
    setMessage({ text, id: Date.now() });
    timer.current = window.setTimeout(() => setMessage(null), 1900);
  }, []);
  // 复制失败兜底：提示并给出可长按选择的文本（沿用旧 CopyButton 的手动复制框思路，R-GLOBAL-07）。
  const copy = useCallback(async (text: string, ok: string) => {
    const done = await writeClipboard(text);
    if (done) toast(ok); else { toast('复制失败，请长按文字手动复制'); setManual(text); }
    return done;
  }, [toast]);
  const openGuide = useCallback(() => setGuide(true), []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  const value = useMemo(() => ({ settings, inApp, latest, toast, copy, openGuide }), [settings, inApp, latest, toast, copy, openGuide]);
  return <UiContext.Provider value={value}>
    {children}
    <div className={`sv-toast${message ? ' is-on' : ''}`} role="status" aria-live="polite" aria-atomic="true">{message?.text}</div>
    <Sheet open={manual !== null} onClose={() => setManual(null)} title="请手动复制" description="当前浏览器不允许自动复制。长按下方内容，选择「复制」。">
      <textarea className="sv-input sv-manual-copy" aria-label="要复制的内容" readOnly value={manual || ''} rows={4} onFocus={e => e.currentTarget.select()}/>
      <button type="button" className="sv-btn sv-btn--ghost sv-btn--block sv-sheet__close" onClick={() => setManual(null)}>我知道了</button>
    </Sheet>
    <GuideSheet open={guide} onClose={() => setGuide(false)} inApp={inApp} copy={copy}/>
  </UiContext.Provider>;
}

/* ================= 弹层（R-SHEET-01） ================= */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
let openSheets = 0;

export function Sheet({ open, onClose, title, description, children, wide = false }: { open: boolean; onClose: () => void; title: string; description?: ReactNode; children: ReactNode; wide?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  useEffect(() => { close.current = onClose; });

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const element = panel.current;
    openSheets += 1;
    document.documentElement.classList.add('sv-lock');
    // 焦点进入弹层的首个可交互元素（输入框优先），没有时聚焦弹层本身。
    const first = element?.querySelector<HTMLElement>('input:not([disabled]), textarea:not([disabled])') || element?.querySelector<HTMLElement>(FOCUSABLE);
    (first || element)?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close.current(); return; }
      if (event.key !== 'Tab' || !element) return;
      const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(el => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) { event.preventDefault(); return; }
      const firstItem = items[0], last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === firstItem || document.activeElement === element)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); firstItem.focus(); }
    }
    element?.addEventListener('keydown', onKey);
    return () => {
      element?.removeEventListener('keydown', onKey);
      openSheets -= 1;
      if (openSheets <= 0) { openSheets = 0; document.documentElement.classList.remove('sv-lock'); }
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  if (!open) return null;
  return <div className="sv-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div ref={panel} className={`sv-sheet${wide ? ' sv-sheet--wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>
      <div className="sv-sheet__grab" aria-hidden="true"/>
      <h2 id={titleId} className="sv-sheet__title">{title}</h2>
      {description && <p className="sv-sheet__desc">{description}</p>}
      {children}
    </div>
  </div>;
}

/* 小红书 / 微信内打开引导（R-SHEET-02）。复制当前页面完整链接（含 platform、release）。 */
function GuideSheet({ open, onClose, inApp, copy }: { open: boolean; onClose: () => void; inApp: InApp; copy: (text: string, ok: string) => Promise<boolean> }) {
  const app = inApp === 'wechat' ? '微信' : '小红书';
  return <Sheet open={open} onClose={onClose} title="请在浏览器中打开后下载" description={`${app}里不能直接下载安装包，按下面做：`}>
    <ol className="sv-guide">
      <li><i aria-hidden="true">1</i><span>点右上角的三个点</span><span className="sv-guide__fake" aria-hidden="true">···</span></li>
      <li><i aria-hidden="true">2</i><span>选择「在浏览器打开」</span><span className="sv-guide__fake" aria-hidden="true">🌐 在浏览器打开</span></li>
      <li><i aria-hidden="true">3</i><span>在浏览器里再点「官方下载」</span><span className="sv-guide__fake" aria-hidden="true">⬇ 官方下载</span></li>
    </ol>
    <div className="sv-tip">找不到这个选项？复制链接，打开手机自带的浏览器，粘贴到地址栏。</div>
    <button type="button" className="sv-btn sv-btn--primary sv-btn--block sv-sheet__primary" onClick={() => copy(window.location.href, '链接已复制，去浏览器粘贴打开')}>复制链接</button>
    <button type="button" className="sv-btn sv-btn--ghost sv-btn--block sv-sheet__close" onClick={onClose}>关闭</button>
  </Sheet>;
}

/* ================= 小组件 ================= */
function shade(hex: string, amount: number) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()); if (!m) return '#1F4FD8';
  const n = parseInt(m[1], 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 - amount)))).toString(16).padStart(2, '0');
  return `#${ch(n >> 16)}${ch((n >> 8) & 255)}${ch(n & 255)}`;
}
export function iconBackground(color?: string) { const c = /^#[0-9a-f]{6}$/i.test(color || '') ? color! : '#3E7BFA'; return `linear-gradient(135deg, ${c}, ${shade(c, 0.22)})`; }

/** 软件图标：有上传图标时显示图片，否则「首字 + 渐变底」。 */
export function SoftIcon({ software, size = 'md' }: { software: Pick<Software, 'name' | 'icon_url' | 'color'>; size?: 'sm' | 'md' | 'lg' | 'xl' }) {
  const [failed, setFailed] = useState(false);
  const dims = { sm: 36, md: 46, lg: 64, xl: 80 }[size];
  return <span className={`sv-ico sv-ico--${size}`} style={{ background: iconBackground(software.color) }} aria-hidden="true">
    {software.icon_url && !failed ? <img src={software.icon_url} alt="" width={dims} height={dims} loading="lazy" onError={() => setFailed(true)}/> : Array.from(software.name.trim())[0] || '软'}
  </span>;
}
export function AdviceTag({ advice }: { advice: Advice }) { const m = adviceMeta[advice] || adviceMeta.optional; return <span className={`sv-tag sv-tag--${m.tone}`}><span aria-hidden="true">{m.icon}</span> {m.label}</span>; }
export function DeviceMini({ platform }: { platform: Platform }) { return <span className="sv-mini" title={platformFull[platform]}><span aria-hidden="true">{platformEmoji[platform]}</span> {platformShort[platform]}</span>; }
export function Dot({ label = '有新版' }: { label?: string }) { return <span className="sv-dot" role="img" aria-label={label}/>; }
export function Badge({ count, label }: { count: number; label?: string }) { return count > 0 ? <span className="sv-badge" aria-label={label || `${count} 个有新版`}>{count > 99 ? '99+' : count}</span> : null; }
export function Empty({ icon, title, children }: { icon?: string; title: ReactNode; children?: ReactNode }) {
  return <div className="sv-empty">{icon && <span className="sv-empty__icon" aria-hidden="true">{icon}</span>}<p className="sv-empty__title">{title}</p>{children}</div>;
}
