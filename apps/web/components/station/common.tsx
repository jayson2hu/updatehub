'use client';

import { useEffect, useRef, useState } from 'react';
import { StationLink as Link } from './design-context';
import { Check, Copy, Film, Monitor, Smartphone, Tv, CircleAlert, ChevronRight, Megaphone, Pin } from 'lucide-react';
import type { Announcement, Platform, Software, Status } from '@/lib/station-types';
import { categoryLabels, formatDate, isExpired } from '@/lib/station';

export function DeviceIcon({ platform, size = 16 }: { platform: string; size?: number }) { const Icon = platform === 'tv' ? Tv : platform === 'desktop' ? Monitor : Smartphone; return <Icon size={size} aria-hidden="true"/>; }
export function BrandMark() {
  return <svg viewBox="0 0 36 36" fill="none" aria-hidden="true"><rect x="12" y="5" width="18" height="23" rx="4" fill="white" fillOpacity=".35"/><rect x="5" y="10" width="21" height="22" rx="5" fill="white"/><path d="M15.5 15v9m-4-4 4 4 4-4M11 27h9" stroke="#245BDD" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function AppGlyph({ slug }: { slug: string }) {
  const shared = { stroke: 'currentColor', strokeWidth: 2.3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return <svg viewBox="0 0 48 48" aria-hidden="true">
    {slug === 'qingning' ? <><path d="M25 12c0-5 5-7 9-6-1 4-4 7-9 6Z" fill="currentColor" opacity=".9"/><circle cx="24" cy="28" r="13" {...shared}/><path d="M24 17v22m-10-17 20 12M14 34l20-12" {...shared} strokeWidth="1.9"/></> :
      slug === 'yunfan' ? <><path d="M23 7v24H9L23 7Z" fill="currentColor"/><path d="m27 13 12 18H27V13Z" fill="currentColor" opacity=".55"/><path d="M9 36h30l-7 6H16l-7-6Z" fill="currentColor"/></> :
      slug === 'shiguang' ? <><circle cx="24" cy="24" r="15" {...shared}/><path d="m22 16 10 8-10 8V16Z" fill="currentColor"/><path d="M24 6v3m0 30v3M6 24h3m30 0h3" {...shared}/></> :
      slug === 'xiaojing' ? <><path d="M37 29c-2 9-23 11-27 0-2-8 4-15 14-15 6 0 10 3 12 7 3 0 5-2 6-4 1 6-1 10-5 12Z" fill="currentColor"/><circle cx="18" cy="24" r="1.6" fill={"#3F99AC"}/><path d="M24 9V5m-4 4-2-2m10 2 2-2" {...shared}/><path d="M15 31c4 4 13 4 17 0" stroke="#3F99AC" strokeWidth="1.6" strokeLinecap="round"/></> :
      slug === 'yinghe' ? <><path d="m24 7 16 9v19l-16 9-16-9V16L24 7Z" {...shared}/><path d="m8 16 16 9 16-9M24 25v19" {...shared}/><path d="m21 15 8 5-8 4v-9Z" fill="currentColor"/></> :
      <><rect x="9" y="11" width="30" height="27" rx="6" {...shared}/><path d="M9 18h30M16 11v7m8-7v7m8-7v7" {...shared} strokeWidth="1.9"/><path d="m21 23 10 6-10 6V23Z" fill="currentColor"/></>}
  </svg>;
}
export function SoftwareIcon({ software, large = false }: { software: Software; large?: boolean }) { const [failed, setFailed] = useState(false); return <span className={`st-app-icon${large ? ' st-app-icon-large' : ''}`} style={{ background: software.color || '#245BDD' }}>{software.icon_url && !failed ? <img src={software.icon_url} alt="" onError={() => setFailed(true)}/> : <AppGlyph slug={software.slug}/>}</span>; }
export function StatusBadge({ status }: { status: Status }) { return <span className={`st-status st-status-${status}`}><span aria-hidden="true"/>{status === 'normal' ? '正常使用' : status === 'attention' ? '需要注意' : '暂时无法使用'}</span>; }
export function CopyButton({ text, label = '复制链接', className = '' }: { text?: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState('');
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    const triggerElement = trigger.current;
    const controls = element?.querySelectorAll<HTMLElement>('textarea, button');
    controls?.[0]?.focus();
    function trap(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
      if (event.key !== 'Tab' || !controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    element?.addEventListener('keydown', trap);
    return () => { element?.removeEventListener('keydown', trap); triggerElement?.focus(); };
  }, [open]);
  async function copy() { const value = text || window.location.href; try { if (!navigator.clipboard?.writeText) throw new Error('unavailable'); await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { setManual(value); setOpen(true); } }
  return <><button ref={trigger} type="button" className={`st-copy ${className}`} onClick={copy}>{copied ? <Check size={15}/> : <Copy size={15}/>}{copied ? '已复制' : label}</button><span className="sr-only" role="status">{copied ? '已复制到剪贴板' : ''}</span>{open && <div ref={dialog} className="st-copy-dialog" role="dialog" aria-modal="true" aria-label="手动复制"><div><h2>请手动复制</h2><p>当前浏览器不允许自动复制。长按下方内容，选择「复制」。</p><textarea aria-label="要复制的内容" value={manual} readOnly onFocus={e => e.currentTarget.select()}/><button type="button" className="st-button st-primary" onClick={() => setOpen(false)}>我知道了</button></div></div>}</>;
}
export function AnnouncementCallout({ notice }: { notice: Announcement }) { return <Link href={`/announcements/${notice.slug}`} className={`st-notice${notice.importance === 'urgent' ? ' st-notice-warning' : ''}`}><span className="st-notice-symbol"><Megaphone size={22}/></span><div><div className="st-notice-meta"><span>{notice.pinned ? <><Pin size={12}/>置顶提醒</> : categoryLabels[notice.category]}</span><time>{formatDate(notice.published_at)}</time>{notice.is_demo && <span className="st-notice-example">示例公告</span>}</div><strong>{notice.title}</strong><p>{notice.summary}</p></div><ChevronRight size={19}/></Link>; }
export function NoticeRow({ notice }: { notice: Announcement }) { const expired = isExpired(notice); return <Link className="st-announcement-row" href={`/announcements/${notice.slug}`}><div className="st-notice-row-icon"><CircleAlert size={22}/></div><div><div className="st-row-labels"><span className="st-label">{categoryLabels[notice.category]}</span>{notice.importance !== 'normal' && <span className="st-label st-label-warm">{notice.importance === 'urgent' ? '重要提醒' : '重要'}</span>}<span className={expired ? 'st-ended' : 'st-muted'}>{expired ? '已结束' : notice.pinned ? '置顶' : '有效公告'}</span></div><h2>{notice.title}</h2><p>{notice.summary}</p><time>{formatDate(notice.published_at)}{notice.is_demo ? '　示例内容' : ''}</time></div><ChevronRight size={20}/></Link>; }
export function EmptyState({ title = '没有找到对应的软件', description = '试试软件名称或常用别名，也可以清除设备筛选。', onReset }: { title?: string; description?: string; onReset?: () => void }) { return <div className="st-empty"><Film size={34}/><h2>{title}</h2><p>{description}</p>{onReset && <button className="st-button st-secondary" onClick={onReset}>清除搜索和筛选</button>}</div>; }
export function PlatformTags({ platforms }: { platforms: Platform[] }) { return <div className="st-platform-tags">{platforms.map(p => <span key={p}><DeviceIcon platform={p}/>{p === 'android' ? '安卓' : p === 'ios' ? '苹果' : p === 'tv' ? '电视' : '电脑'}</span>)}</div>; }
