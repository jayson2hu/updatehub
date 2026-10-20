'use client';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { X, Send, FileText, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import type { Advice, Announcement, Platform, Release, StationData } from '@/lib/station-types';
import { adviceMeta, noticeText } from '@/lib/station-view';
import { errorText, Field, Flash, labels, newSlug, useStationAdmin } from './common';

export const changed = () => window.dispatchEvent(new Event('station:admin-changed'));
export function openPublisher(kind: 'release' | 'announcement', softwareId = '') { window.dispatchEvent(new CustomEvent('station:publish', { detail: { kind, softwareId } })); }
export function announcementText(siteName: string, title: string, body: string, url: string) { return `【${siteName}】${title}\n${body.split(/\n\s*\n/)[0]}\n\n详情 👇\n${url}\n（小红书里打不开就点右上角···，选“在浏览器打开”）`; }

export function QuickPublisher() {
  const [request, setRequest] = useState<{ kind: 'release' | 'announcement'; softwareId: string } | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 4000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => { const listener = (e: Event) => setRequest((e as CustomEvent).detail); window.addEventListener('station:publish', listener); return () => window.removeEventListener('station:publish', listener); }, []);
  return <>{message && <div className="sa-toast" role="status">{message}</div>}{request && <Publisher request={request} close={() => setRequest(null)} report={setMessage}/>}</>;
}
function Publisher({ request, close, report }: { request: { kind: 'release' | 'announcement'; softwareId: string }; close: () => void; report: (message: string) => void }) {
  const { data, error, reload } = useStationAdmin();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const trigger = document.activeElement as HTMLElement; ref.current?.showModal(); const before = document.body.style.overflow; document.body.style.overflow = 'hidden'; return () => { document.body.style.overflow = before; trigger?.focus(); }; }, []);
  return <dialog ref={ref} className="sa-quick" aria-labelledby="sa-quick-title" onCancel={close} onClick={e => { if (e.target === e.currentTarget) close(); }}><div className="sa-quick-head"><div><span className="sa-eyebrow">内容发布</span><h2 id="sa-quick-title">{request.kind === 'release' ? '发布软件更新' : '发群公告'}</h2></div><button className="sa-icon-button" aria-label="关闭发布窗口" onClick={close}><X/></button></div>{data ? <QuickForm data={data} request={request} close={close} report={report}/> : <div className="sa-quick-body"><p role={error ? 'alert' : 'status'}>{error || '正在读取软件…'}</p>{error && <button className="sa-button" onClick={reload}>重试</button>}</div>}</dialog>;
}
function QuickForm({ data, request, close, report }: { data: StationData; request: { kind: 'release' | 'announcement'; softwareId: string }; close: () => void; report: (message: string) => void }) {
  const router = useRouter();
  const isRelease = request.kind === 'release';
  const [softwareId, setSoftwareId] = useState(request.softwareId || data.software.find(s => s.published)?.id || '');
  const selected = data.software.find(s => s.id === softwareId);
  const [platforms, setPlatforms] = useState<Platform[]>(selected?.platforms.slice(0, 1) || []);
  const [version, setVersion] = useState(''); const [summary, setSummary] = useState(''); const [advice, setAdvice] = useState<Advice>('recommended');
  const [note, setNote] = useState(''); const [urls, setUrls] = useState<Partial<Record<Platform, string>>>({});
  const [stableIds, setStableIds] = useState<Partial<Record<Platform, string>>>({});
  const [body, setBody] = useState(''); const [category, setCategory] = useState<Announcement['category']>('group');
  const [important, setImportant] = useState(false); const [pinned, setPinned] = useState(false); const [expires, setExpires] = useState('');
  const [associated, setAssociated] = useState<string[]>([]); const [busy, setBusy] = useState(false); const [failure, setFailure] = useState(''); const [success, setSuccess] = useState('');
  const [publishedText, setPublishedText] = useState(''); const [saved, setSaved] = useState(false);
  const [continuePath, setContinuePath] = useState('');
  const manual = useRef<HTMLTextAreaElement>(null);
  const previous = (p: Platform) => data.releases.find(r => r.software_id === softwareId && r.platform === p && r.published);
  const urlFor = (p: Platform) => urls[p] ?? previous(p)?.links.find(l => l.kind !== 'netdisk')?.url ?? '';
  function linksFor(p: Platform) {
    const old = previous(p)?.links || [];
    const primary = old.find(l => l.kind !== 'netdisk');
    const backups = old.filter(l => l !== primary).map(l => ({ label: l.label, url: l.url, code: l.code, kind: l.kind, is_active: l.is_active, is_primary: false }));
    const url = urlFor(p).trim();
    const main = url ? [{ label: primary?.label || '官方来源', url, code: primary?.code || '', kind: primary?.kind || 'official', is_active: true, is_primary: true }] : [];
    return [...main, ...backups].map((l, i) => ({ ...l, is_primary: i === 0 }));
  }
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const preview = isRelease && selected ? noticeText({ siteName: data.settings.site_name, software: selected, release: { version: version || '版本号', summary, advice, advice_note: note, platform: platforms[0] || 'android' } as Release, stable: data.releases.find(r => r.id === stableIds[platforms[0]]), url: `${origin}/software/${selected.slug}?platform=${platforms[0] || 'android'}`, tip: data.settings.notice_tip }) : announcementText(data.settings.site_name, summary || '公告标题', body || '公告正文', `${origin}/announcements/发布后生成`);
  async function copyAndClose(text: string) {
    try { await navigator.clipboard.writeText(text); changed(); report('已发布，群通知已复制，可以粘贴到群里了。'); close(); }
    catch { setSuccess('已发布。浏览器未允许自动复制，请全选下方群通知手动复制。'); setTimeout(() => { manual.current?.focus(); manual.current?.select(); }, 50); }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (saved || busy) return;
    const intent = ((e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value;
    const publish = intent === 'publish';
    setBusy(true); setFailure('');
    try {
      let text = '';
      let path = '';
      if (isRelease) {
        if (!selected || !platforms.length) throw new Error('请选择软件及至少一种设备');
        const moment = new Date().toISOString();
        const releases = await api<Release[]>('/admin/station/releases/batch', { method: 'POST', body: JSON.stringify({ releases: platforms.map(p => ({ software_id: softwareId, platform: p, version, summary, advice, advice_note: note, stable_release_id: advice === 'hold' ? stableIds[p] : null, notes: body, links: linksFor(p), published: publish, published_at: publish ? moment : null, requirements: previous(p)?.requirements || '' })) }) });
        text = releases.map(r => noticeText({ siteName: data.settings.site_name, software: selected, release: r, stable: data.releases.find(x => x.id === r.stable_release_id), url: `${origin}/software/${selected.slug}?platform=${r.platform}&release=${r.id}`, tip: data.settings.notice_tip })).join('\n\n');
        path = `/admin/station/releases/${releases[0].id}`;
      } else {
        const result = await api<Announcement>('/admin/station/announcements', { method: 'POST', body: JSON.stringify({ slug: newSlug('notice'), title: summary, summary: body.split('\n')[0].slice(0, 150), body, category, importance: important ? 'important' : 'normal', pinned, expires_at: expires ? new Date(`${expires}T23:59:59+08:00`).toISOString() : null, software_ids: associated, published: publish }) });
        text = announcementText(data.settings.site_name, summary, body, `${origin}/announcements/${result.slug}`);
        path = `/admin/station/announcements/${result.id}`;
      }
      changed(); setSaved(true); setPublishedText(text); setContinuePath(path);
      if (intent === 'expand') { router.push(path); close(); return; }
      if (publish) { setSuccess('已发布，正在复制群通知…'); await copyAndClose(text); }
      else setSuccess('草稿已保存，访客不可见。可以关闭窗口，在版本或公告列表继续编辑。');
    } catch (error) { setFailure(errorText(error)); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit}><div className="sa-quick-body"><Flash error={failure} success={success}/>{!saved && <>{isRelease ? <>
    <Field label="选择软件"><select required value={softwareId} onChange={e => { setSoftwareId(e.target.value); setPlatforms(data.software.find(s => s.id === e.target.value)?.platforms.slice(0, 1) || []); setUrls({}); setStableIds({}); }}><option value="">请选择软件</option>{data.software.map(s => <option key={s.id} value={s.id}>{s.name}{!s.published ? '（未上架）' : ''}</option>)}</select></Field>
    <fieldset className="sa-check-group"><legend>更新设备 · 同版本可多选</legend>{selected?.platforms.map(p => <label key={p}><input type="checkbox" checked={platforms.includes(p)} onChange={e => setPlatforms(prev => e.target.checked ? [...prev, p] : prev.filter(v => v !== p))}/>{labels[p]}</label>)}</fieldset>
    <Field label="新版本号"><input required maxLength={80} placeholder="例如 3.2.1" value={version} onChange={e => setVersion(e.target.value)}/></Field>
    <div className="sa-field"><span>更新建议</span><div className="sa-choice">{Object.entries(adviceMeta).map(([key, meta]) => <button type="button" key={key} aria-pressed={advice === key} onClick={() => setAdvice(key as Advice)}>{meta.icon} {meta.label}</button>)}</div></div>
    {advice === 'hold' && platforms.map(p => <Field key={p} label={`${labels[p]}推荐稳定版（必选）`}><select required value={stableIds[p] || ''} onChange={e => setStableIds(prev => ({ ...prev, [p]: e.target.value }))}><option value="">选择已发布的稳定版本</option>{data.releases.filter(r => r.software_id === softwareId && r.platform === p && r.published && r.status !== 'unavailable' && r.advice !== 'hold').map(r => <option key={r.id} value={r.id}>{r.version}</option>)}</select></Field>)}
  </> : <div className="sa-form-grid"><Field label="公告类型"><select value={category} onChange={e => setCategory(e.target.value as Announcement['category'])}><option value="group">群公告</option><option value="usage">使用提醒</option><option value="maintenance">维护通知</option></select></Field><Field label="重要程度"><select value={important ? 'important' : 'normal'} onChange={e => setImportant(e.target.value === 'important')}><option value="normal">普通</option><option value="important">重要</option></select></Field></div>}
    <Field label={isRelease ? '一句话说明（最多 40 字）' : '公告标题（最多 40 字）'}><input required maxLength={40} value={summary} placeholder={isRelease ? '修复部分电视设备启动后黑屏的问题。' : '这次需要提醒群友什么？'} onChange={e => setSummary(e.target.value)}/></Field>
    {isRelease ? <>{platforms.map(p => <Field key={p} label={`官方下载链接（${labels[p]}）`} hint="没有真实链接可留空，前台会显示未配置。"><input type="url" placeholder="https://" value={urlFor(p)} onChange={e => setUrls(prev => ({ ...prev, [p]: e.target.value }))}/></Field>)}<details className="sa-more"><summary><ChevronDown size={16}/>更多内容</summary><Field label="建议说明"><textarea rows={2} maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></Field><Field label="详细更新说明"><textarea rows={3} value={body} onChange={e => setBody(e.target.value)}/></Field><button type="submit" name="intent" value="expand" className="sa-text-button" disabled={busy}>保存草稿并在完整编辑页继续</button></details></> : <><Field label="公告正文"><textarea rows={5} required value={body} onChange={e => setBody(e.target.value)}/></Field><label className="sa-checkbox"><input type="checkbox" checked={pinned} onChange={e => setPinned(e.target.checked)}/>置顶显示</label><Field label="有效期至（可留空）"><input type="date" value={expires} onChange={e => setExpires(e.target.value)}/></Field><fieldset className="sa-check-group"><legend>关联软件</legend>{data.software.map(s => <label key={s.id}><input type="checkbox" checked={associated.includes(s.id)} onChange={e => setAssociated(prev => e.target.checked ? [...prev, s.id] : prev.filter(id => id !== s.id))}/>{s.name}</label>)}</fieldset></>}
  </>}
    <div className="sa-notice-preview"><strong>群通知预览</strong><textarea ref={manual} readOnly rows={7} aria-label="群通知预览" value={publishedText || preview} onFocus={e => e.target.select()}/></div>
    </div><footer className="sa-quick-foot">{saved ? <><button type="button" className="sa-button sa-secondary" onClick={close}>完成</button>{continuePath && <Link className="sa-button sa-secondary" href={continuePath} onClick={close}>继续编辑</Link>}{success.includes('已发布') && <button type="button" className="sa-button" onClick={() => copyAndClose(publishedText)}>复制群通知并关闭</button>}</> : <><button type="submit" name="intent" value="draft" className="sa-button sa-secondary" disabled={busy}><FileText size={16}/>存草稿</button><button type="submit" name="intent" value="publish" className="sa-button" disabled={busy}><Send size={16}/>{busy ? '正在保存…' : '发布并复制群通知'}</button></>}</footer></form>;
}
