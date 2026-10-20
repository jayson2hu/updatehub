'use client';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api';
import type { IssueKind, Platform, Release, Software, SyncCode } from '@/lib/station-types';
import { adviceMeta, issueKinds, monthDay, noticeText, normalizeQuery, platformEmoji, platformFull, platformShort } from '@/lib/station-view';
import { allPlatforms } from '@/lib/station';
import { deviceStore, favoritesStore, feedbackStore, mergeFavorites, syncStore, syncFingerprint, wishesStore, type FeedbackRecord } from '@/hooks/use-station-local';
import { castFeedback } from '@/lib/station-feedback';
import { useLocalStore } from '@/hooks/local-store';
import { QrPreview } from './qr-preview';
import { Sheet, SoftIcon, useStationUi } from './ui';

export function errorMessage(error: unknown, fallback = '提交失败，请稍后再试') {
  if (error instanceof ApiError) {
    if (error.status === 429) return '操作太频繁，请稍后再试';
    if (error.status === 0) return '网络好像断了，请检查后重试';
  }
  return error instanceof Error ? error.message : fallback;
}
const CloseButton = ({ onClose, label = '关闭' }: { onClose: () => void; label?: string }) => <button type="button" className="sv-btn sv-btn--ghost sv-btn--block sv-sheet__close" onClick={onClose}>{label}</button>;

/* ================= 分享（R-SHEET-03） ================= */
export function ShareSheet({ open, onClose, software, release, stable, url }: { open: boolean; onClose: () => void; software: Software; release?: Release; stable?: Release; url: string }) {
  return <Sheet open={open} onClose={onClose} title="分享这个软件">{release ? <ShareBody software={software} release={release} stable={stable} url={url} onClose={onClose}/> : <><p className="sv-u-small sv-u-muted">这个设备还没有发布版本。</p><CloseButton onClose={onClose}/></>}</Sheet>;
}
function ShareBody({ software, release, stable, url, onClose }: { software: Software; release: Release; stable?: Release; url: string; onClose: () => void }) {
  const { settings, copy, toast } = useStationUi();
  const [poster, setPoster] = useState<string | null>(null);
  async function savePoster() {
    let dataUrl: string;
    try { const { drawPoster } = await import('./qr'); dataUrl = drawPoster({ siteName: settings.site_name, software, release, url }); }
    catch { toast('海报生成失败，请截图保存'); return; }
    setPoster(dataUrl);
    // 手机浏览器多数不支持直接下载图片：显示图片供长按保存；电脑直接下载 PNG。
    const coarse = window.matchMedia('(pointer: coarse)').matches;
    if (!coarse) {
      const a = document.createElement('a'); a.href = dataUrl; a.download = `${software.name}-${release.version}.png`;
      document.body.appendChild(a); a.click(); a.remove();
      toast('海报已保存');
    } else toast('长按图片保存');
  }
  const text = noticeText({ siteName: settings.site_name, software, release, stable, url, tip: settings.notice_tip });
  return <>
    {poster
      ? <img className="sv-poster-img" src={poster} alt={`${software.name} ${release.version} 分享海报，长按保存`}/>
      : <div className="sv-poster" aria-label="海报预览">
        <div className="sv-poster__top">
          <div className="sv-u-row"><SoftIcon software={software} size="sm"/><div><b>{software.name} {release.version}</b><div className="sv-u-xs sv-poster__sub">{adviceMeta[release.advice].label} · {monthDay(release.published_at)}</div></div></div>
          {(release.summary || software.summary) && <p className="sv-u-small sv-poster__sum">{release.summary || software.summary}</p>}
        </div>
        <div className="sv-poster__bot"><QrPreview text={url} label={`${software.name}页面二维码`} className="sv-poster__qr"/><div className="sv-u-small"><b>扫码查看下载和教程</b><div className="sv-u-xs sv-u-muted">{settings.site_name} · 群友整理的软件更新</div></div></div>
      </div>}
    <div className="sv-share-actions">
      <button type="button" className="sv-btn sv-btn--soft" onClick={() => copy(url, '链接已复制')}>🔗 复制链接</button>
      <button type="button" className="sv-btn sv-btn--soft" onClick={() => copy(text, '群通知文案已复制')}>💬 复制群文案</button>
      <button type="button" className="sv-btn sv-btn--soft" onClick={savePoster}>🖼 保存海报</button>
    </div>
    <CloseButton onClose={onClose}/>
  </>;
}

/* ================= 反馈问题（R-SHEET-04） ================= */
export function FeedbackSheet({ open, onClose, software, release, linkId, onDone }: { open: boolean; onClose: () => void; software: Software; release?: Release; linkId?: string; onDone?: (releaseId: string) => void }) {
  return <Sheet open={open} onClose={onClose} title="遇到了什么问题？" description={release ? <>{software.name} · {platformFull[release.platform]}　匿名提交，群主会看到</> : undefined}>
    {release ? <FeedbackForm software={software} release={release} linkId={linkId} onClose={onClose} onDone={onDone}/> : <><p className="sv-u-small sv-u-muted">这个设备还没有发布版本，暂时不能反馈。</p><CloseButton onClose={onClose}/></>}
  </Sheet>;
}
function FeedbackForm({ software, release, onClose, onDone }: { software: Software; release: Release; linkId?: string; onClose: () => void; onDone?: (releaseId: string) => void }) {
  const { toast } = useStationUi();
  const [kind, setKind] = useState<IssueKind | null>(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!kind || busy) return;
    setBusy(true);
    try {
      if (!feedbackStore.get().some(r => r.releaseId === release.id && r.verdict === 'issue')) await castFeedback(software, release, 'issue');
      await castFeedback(software, release, 'issue', { kind, note: note.trim() });
      onDone?.(release.id);
      toast('已提交，群主会尽快处理'); onClose();
    } catch (error) { toast(errorMessage(error, '提交失败，请稍后再试')); setBusy(false); }
  }
  return <form onSubmit={submit}>
    <div className="sv-chips sv-chips--wrap sv-sheet__chips" role="group" aria-label="问题类型（必选）">{issueKinds.map(([value, label]) => <button key={value} type="button" className="sv-chip" aria-pressed={kind === value} onClick={() => setKind(value)}>{label}</button>)}</div>
    <div className="sv-field">
      <label htmlFor="sv-fb-note">补充说明（选填）</label>
      <textarea id="sv-fb-note" className="sv-input" rows={3} maxLength={300} placeholder="比如：手机型号、卡在哪一步" value={note} onChange={e => setNote(e.target.value.slice(0, 300))}/>
      <span className="sv-field__count" aria-live="polite">{note.length}/300</span>
    </div>
    <button type="submit" className="sv-btn sv-btn--primary sv-btn--block sv-sheet__primary" disabled={!kind || busy}>{busy ? '提交中…' : '提交反馈'}</button>
    <CloseButton onClose={onClose}/>
  </form>;
}
/** 本机记录：每个版本只保留一票（R-DETAIL-18）。 */
export function saveFeedback(record: FeedbackRecord) { feedbackStore.set(prev => [record, ...prev.filter(r => r.releaseId !== record.releaseId)].slice(0, 200)); }

/* ================= 同步码（R-SHEET-05） ================= */
export const formatSyncCode = (code: string) => code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
const cleanCode = (value: string) => value.replace(/[\s-]/g, '').toUpperCase();

export function SyncSheet({ open, onClose, mode, autoGenerate = false }: { open: boolean; onClose: () => void; mode: 'gen' | 'in'; autoGenerate?: boolean }) {
  return <Sheet open={open} onClose={onClose} title="同步收藏" description="不用注册，用同步码在另一台设备上恢复收藏。"><SyncBody initial={mode} autoGenerate={autoGenerate} onClose={onClose}/></Sheet>;
}
function SyncBody({ initial, autoGenerate, onClose }: { initial: 'gen' | 'in'; autoGenerate: boolean; onClose: () => void }) {
  const [mode, setMode] = useState(initial);
  const select = (next: 'gen' | 'in') => setMode(next);
  return <>
    <div className="sv-seg" role="tablist" aria-label="同步方式" onKeyDown={e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); const next = mode === 'gen' ? 'in' : 'gen'; select(next); (e.currentTarget.querySelector(`[data-mode="${next}"]`) as HTMLElement | null)?.focus(); } }}>
      <button type="button" role="tab" data-mode="gen" aria-selected={mode === 'gen'} tabIndex={mode === 'gen' ? 0 : -1} onClick={() => select('gen')}>生成同步码</button>
      <button type="button" role="tab" data-mode="in" aria-selected={mode === 'in'} tabIndex={mode === 'in' ? 0 : -1} onClick={() => select('in')}>输入同步码</button>
    </div>
    <div role="tabpanel">{mode === 'gen' ? <SyncGenerate auto={autoGenerate && initial === 'gen'}/> : <SyncRestore onClose={onClose}/>}</div>
    <CloseButton onClose={onClose}/>
  </>;
}
function SyncGenerate({ auto }: { auto: boolean }) {
  const { copy, toast } = useStationUi();
  const favorites = useLocalStore(favoritesStore);
  const device = useLocalStore(deviceStore);
  const saved = useLocalStore(syncStore);
  const [openedAt] = useState(() => Date.now());
  const valid = saved && new Date(saved.expiresAt).getTime() > openedAt && saved.fingerprint === syncFingerprint(favorites, device) ? saved : null;
  const [busy, setBusy] = useState(auto && favorites.length > 0 && !valid);

  async function request() {
    const ids = favoritesStore.get(); const selectedDevice = deviceStore.get();
    const result = await api<SyncCode>('/station/sync-codes', { method: 'POST', body: JSON.stringify({ software_ids: ids, device: selectedDevice, previous_code: syncStore.get()?.code || '' }) });
    syncStore.set({ code: result.code, expiresAt: result.expires_at, count: result.software_ids.length, fingerprint: syncFingerprint(ids, selectedDevice) });
  }
  // 从「我的」点「生成同步码」进入时自动生成；收藏没变且码未过期时直接展示已有的码。
  const started = useRef(false);
  useEffect(() => {
    // 只发一次请求（开发模式 StrictMode 会重复执行 effect；同步码生成有限流）。
    if (!busy || started.current) return;
    started.current = true;
    request().catch(error => toast(errorMessage(error, '暂时无法生成同步码，请稍后重试'))).finally(() => setBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the auto-generate request
  }, []);
  async function generate() {
    setBusy(true);
    try { await request(); } catch (error) { toast(errorMessage(error, '暂时无法生成同步码，请稍后重试')); } finally { setBusy(false); }
  }
  if (!favorites.length) return <p className="sv-sync-empty">还没有收藏，先去收藏几个软件吧</p>;
  const code = valid?.code;
  return <>
    <div className="sv-bigcode sv-mono" aria-live="polite" aria-label={code ? `同步码 ${code.split('').join(' ')}` : '同步码尚未生成'}>{busy ? '生成中…' : code ? formatSyncCode(code) : '— — —'}</div>
    <p className="sv-u-xs sv-u-muted sv-u-center">包含你的 {favorites.length} 个收藏 · 30 天内有效 · 不包含任何个人信息{device ? ` · 常用设备：${platformFull[device]}` : ''}</p>
    {code
      ? <button type="button" className="sv-btn sv-btn--primary sv-btn--block sv-sheet__primary" onClick={() => copy(formatSyncCode(code), '同步码已复制，在新设备上输入即可')}>复制同步码</button>
      : <button type="button" className="sv-btn sv-btn--primary sv-btn--block sv-sheet__primary" disabled={busy} onClick={generate}>{busy ? '生成中…' : '生成同步码'}</button>}
    {code && <button type="button" className="sv-btn sv-btn--ghost sv-btn--block sv-u-mt8" disabled={busy} onClick={generate}>重新生成（旧码作废）</button>}
  </>;
}
function SyncRestore({ onClose }: { onClose: () => void }) {
  const { toast, latest } = useStationUi();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const code = cleanCode(value);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (code.length !== 10) { setError('同步码不对，请检查后重试'); return; }
    setBusy(true); setError('');
    try {
      const result = await api<SyncCode>(`/station/sync-codes/${encodeURIComponent(code)}`);
      const added = mergeFavorites(result.software_ids, latest);
      if (result.device && !deviceStore.get()) deviceStore.set(result.device);
      toast(`已恢复，新增 ${added} 个收藏`); onClose();
    } catch (err) {
      setError(err instanceof ApiError && err.status === 404 ? (err.message || '同步码不对，请检查后重试') : errorMessage(err, '恢复失败，请稍后再试'));
      setBusy(false);
    }
  }
  return <form onSubmit={submit}>
    <div className="sv-field">
      <label htmlFor="sv-sync-input">在另一台设备上生成的同步码</label>
      <input id="sv-sync-input" className="sv-input sv-input--code sv-mono" inputMode="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} placeholder="XB7K2-M9Q4T" value={value} aria-invalid={!!error} aria-describedby={error ? 'sv-sync-error' : undefined} onChange={e => { setValue(e.target.value.toUpperCase()); setError(''); }}/>
      {error && <p id="sv-sync-error" className="sv-field__error" role="alert">{error}</p>}
    </div>
    <button type="submit" className="sv-btn sv-btn--primary sv-btn--block sv-sheet__primary" disabled={busy || code.length < 10}>{busy ? '恢复中…' : '恢复收藏'}</button>
    <p className="sv-u-xs sv-u-muted sv-u-mt8">恢复后会和这台设备上的收藏合并，不会覆盖。</p>
  </form>;
}

/* ================= 想要的软件（R-SHEET-06） ================= */
export function WishSheet({ open, onClose, initialName = '' }: { open: boolean; onClose: () => void; initialName?: string }) {
  return <Sheet open={open} onClose={onClose} title="想要什么软件？" description="告诉群主，收录后会在“我的 → 想要的软件”里显示。"><WishForm initialName={initialName} onClose={onClose}/></Sheet>;
}
function WishForm({ initialName, onClose }: { initialName: string; onClose: () => void }) {
  const { toast } = useStationUi();
  const [name, setName] = useState(initialName.slice(0, 30));
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const ok = Array.from(trimmed).length >= 2;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!ok || busy) return;
    // 同一设备对同一请求只计 1 票（本地按归一后的名称去重）。
    const key = normalizeQuery(trimmed).replace(/\s+/g, '');
    if (wishesStore.get().some(w => normalizeQuery(w.name).replace(/\s+/g, '') === key)) { toast('你已经提交过这个软件了'); onClose(); return; }
    setBusy(true);
    try {
      const result = await api<{ id: string; votes: number; status: string }>('/station/wishes', { method: 'POST', body: JSON.stringify({ name: trimmed, platforms, note: note.trim() }) });
      wishesStore.set(prev => [{ ...result, name: trimmed, platforms, at: new Date().toISOString() }, ...prev].slice(0, 50));
      toast('已提交，收录后会在“我的”里显示'); onClose();
    } catch (error) { toast(errorMessage(error)); setBusy(false); }
  }
  const togglePlatform = (p: Platform) => setPlatforms(prev => prev.includes(p) ? prev.filter(v => v !== p) : [...prev, p]);
  return <form onSubmit={submit}>
    <div className="sv-field"><label htmlFor="sv-wish-name">软件名称</label><input id="sv-wish-name" className="sv-input" required minLength={2} maxLength={30} placeholder="例如：某某输入法" value={name} onChange={e => setName(e.target.value)}/></div>
    <div className="sv-field"><span className="sv-field__label" id="sv-wish-dev">用在什么设备</span><div className="sv-chips sv-chips--wrap" role="group" aria-labelledby="sv-wish-dev">{allPlatforms.map(p => <button key={p} type="button" className="sv-chip" aria-pressed={platforms.includes(p)} onClick={() => togglePlatform(p)}><span aria-hidden="true">{platformEmoji[p]}</span> {platformShort[p]}</button>)}</div></div>
    <div className="sv-field"><label htmlFor="sv-wish-note">用途（选填）</label><input id="sv-wish-note" className="sv-input" maxLength={50} placeholder="比如：电视上看直播" value={note} onChange={e => setNote(e.target.value)}/></div>
    <button type="submit" className="sv-btn sv-btn--primary sv-btn--block sv-sheet__primary" disabled={!ok || busy}>{busy ? '提交中…' : '提交'}</button>
    <CloseButton onClose={onClose}/>
  </form>;
}
