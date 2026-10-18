'use client';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ExternalLink, ImagePlus, Plus, Radio, Settings2, Trash2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { Promotion, Settings, StationData } from '@/lib/station-types';
import { isPromotionActive, isPromotionEnded, safeLink } from '@/lib/station';
import { Copy, date, errorText, Field, Flash, Heading, ImageUpload, newSlug, Pending, Preview, SaveActions, useStationAdmin, writeBody } from './common';

export const placements = { home_feed: '首页更新列表中部', detail_body: '软件详情正文', desktop_sidebar: '桌面端侧栏' };
function state(p: Promotion) { return !p.published ? '未上线' : isPromotionEnded(p) ? '已结束' : isPromotionActive(p) ? '投放中' : '等待开始'; }

export function PromotionsPage() {
  const { data, error, reload } = useStationAdmin();
  const [failure, setFailure] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState(false);
  if (!data) return <Pending error={error} retry={reload}/>;
  async function toggle() {
    setBusy(true); setFailure('');
    try { await api<Settings>('/admin/station/settings', { method: 'PATCH', body: JSON.stringify({ ads_enabled: !data!.settings.ads_enabled }) }); setSuccess(data!.settings.ads_enabled ? '广告已全部关闭，软件与公告继续正常展示。' : '广告已启用，只有已上线且在有效期内的内容会展示。'); reload(); }
    catch (cause) { setFailure(errorText(cause)); } finally { setBusy(false); }
  }
  return <div className="sa-page"><Heading title="广告与推广" description="素材、投放位置与活动时间独立维护。软件获取入口始终保持独立。" action={<Link href="/admin/station/promotions/new" className="sa-button"><Plus size={18}/>新建推广</Link>}/><Flash error={failure || error} success={success}/>
    <section className="sa-ad-control"><span className="sa-ad-control-icon"><Radio size={25}/></span><div><h2>广告总开关 <span className={`sa-tag ${data.settings.ads_enabled ? 'sa-published' : ''}`}>{data.settings.ads_enabled ? '已启用' : '已关闭'}</span></h2><p>{data.settings.ads_enabled ? '仅展示有效投放；关闭后，全部广告位与活动页即时下线。' : '当前前台不展示任何广告，也不会保留空白占位。'}</p></div><button className={`sa-button ${data.settings.ads_enabled ? 'sa-secondary' : ''}`} disabled={busy} onClick={toggle}>{busy ? '正在保存…' : data.settings.ads_enabled ? '关闭全部广告' : '启用广告'}</button></section>
    <section className="sa-panel sa-list-panel">{data.promotions.length ? data.promotions.map(p => <article className="sa-record sa-list-record" key={p.id}>{p.cover_url ? <img className="sa-promo-thumb" src={p.cover_url} alt=""/> : <span className="sa-software-glyph"><ImagePlus size={22}/></span>}<div className="sa-record-copy"><div className="sa-title-line"><Link href={`/admin/station/promotions/${p.id}`}><strong>{p.title}</strong></Link><span className={`sa-tag ${isPromotionActive(p) ? 'sa-published' : ''}`}>{state(p)}</span></div><p>{p.summary}</p><small>{p.placements.map(v => placements[v as keyof typeof placements]).join('、') || '仅独立活动页'} · {p.starts_at ? date(p.starts_at) : '不限开始'} 至 {p.ends_at ? date(p.ends_at) : '不限结束'}</small></div><div className="sa-record-actions"><Link href={`/admin/station/promotions/${p.id}`} className="sa-button sa-secondary">管理投放</Link>{p.published && <Copy value={`/promo/${p.slug}`}/>}</div></article>) : <div className="sa-empty"><ImagePlus size={32}/><h2>准备好素材，再开始推广</h2><p>支持首页、软件详情与桌面侧栏，也可以仅创建独立活动页。</p><Link className="sa-button" href="/admin/station/promotions/new">新建第一条推广</Link></div>}</section>
    <div className="sa-ad-foundation"><Settings2 size={20}/><div><strong>后续广告服务的接入位置已保留</strong><p>当前支持本站素材投放。第三方广告可接入统一展示组件，沿用总开关、位置和时间校验；第三方服务和统计暂未接入。</p></div></div>
  </div>;
}

type PromotionForm = Omit<Promotion, 'id'>;
const blank = (): PromotionForm => ({ slug: newSlug('activity'), title: '', summary: '', body: '', cover_url: '', action_label: '了解活动', target_url: '', starts_at: null, ends_at: null, published: false, placements: ['home_feed'] });
function localTime(value: string | null) { if (!value) return ''; const time = new Date(value); return new Date(time.getTime() - time.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }

export function PromotionEditor({ id }: { id?: string }) {
  const { data, error, reload } = useStationAdmin();
  if (!data) return <Pending error={error} retry={reload}/>;
  if (id && !data.promotions.some(p => p.id === id)) return <Pending error="没有找到这条推广，请返回列表。" retry={reload}/>;
  return <PromotionFormView data={data} initial={data.promotions.find(p => p.id === id)}/>;
}
function PromotionFormView({ data, initial }: { data: StationData; initial?: Promotion }) {
  const [form, setForm] = useState<PromotionForm>(initial || blank);
  const [id, setId] = useState(initial?.id); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [success, setSuccess] = useState(''); const [preview, setPreview] = useState(false);
  function update<K extends keyof PromotionForm>(key: K, value: PromotionForm[K]) { setForm(f => ({ ...f, [key]: value })); }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const published = ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement)?.value === 'publish';
    setBusy(true); setError(''); setSuccess('');
    try { const saved = await api<Promotion>(`/admin/station/promotions${id ? `/${id}` : ''}`, { method: id ? 'PATCH' : 'POST', body: writeBody({ ...form, published }) }); setId(saved.id); setForm(saved); setSuccess(published ? `推广已上线。${data.settings.ads_enabled ? '会按所设时间和位置展示。' : '广告总开关仍关闭，请到广告与推广列表启用。'}` : '推广已保存为未上线状态，访客无法访问。'); }
    catch (cause) { setError(errorText(cause)); } finally { setBusy(false); }
  }
  return <div className="sa-page"><Heading title={id ? '编辑推广' : '新建推广'} description="明确标注推广，保持软件获取过程清楚、直接。" back="/admin/station/promotions"/><Flash error={error} success={success}/>{id && form.published && <div className="sa-publish-result"><Copy value={`/promo/${form.slug}`}/><Link className="sa-text-link" href={`/promo/${form.slug}`}>查看活动页<ExternalLink size={15}/></Link></div>}<form onSubmit={save}><div className="sa-editor-layout"><div>
    <section className="sa-panel"><h2>活动内容</h2><div className="sa-form-grid"><Field label="推广标题" wide><input required maxLength={200} value={form.title} onChange={e => update('title', e.target.value)}/></Field><Field label="分享链接标识" hint="创建后固定不变，使用英文、数字与短横线。"><input required pattern="[a-z0-9]+(-[a-z0-9]+)*" readOnly={!!id} value={form.slug} onChange={e => update('slug', e.target.value)}/></Field><Field label="按钮文字"><input required maxLength={60} value={form.action_label} onChange={e => update('action_label', e.target.value)} placeholder="了解活动"/></Field><Field label="简短介绍" wide><textarea rows={2} maxLength={600} value={form.summary} onChange={e => update('summary', e.target.value)}/></Field><Field label="活动正文" wide hint="每段单独换行，正文以安全的纯文字保存。"><textarea rows={7} maxLength={40000} value={form.body} onChange={e => update('body', e.target.value)}/></Field><Field label="活动目标链接" wide hint="与软件获取链接分开保存；上线时必须填写。"><input type="url" value={form.target_url} onChange={e => update('target_url', e.target.value)} placeholder="https://"/></Field></div></section>
    <section className="sa-panel"><h2>推广封面</h2>{form.cover_url && <div className="sa-promo-cover"><img src={form.cover_url} alt="推广封面预览"/><button className="sa-text-button" type="button" onClick={() => update('cover_url', '')}><Trash2 size={15}/>移除封面</button></div>}<ImageUpload label="上传推广封面" onUpload={url => update('cover_url', url)}/><p className="sa-help">建议使用 16:9 图片。图片真实保存，刷新与重启后仍可使用。</p></section>
    <section className="sa-panel"><h2>投放安排</h2><fieldset className="sa-check-group"><legend>展示位置（可多选）</legend>{Object.entries(placements).map(([value, label]) => <label key={value}><input type="checkbox" checked={form.placements.includes(value)} onChange={e => update('placements', e.target.checked ? [...form.placements, value] : form.placements.filter(v => v !== value))}/>{label}</label>)}</fieldset><p className="sa-help">不选择位置时，仅提供独立活动页；同一位置有多条活动时，按分享链接标识排序，展示第一条有效活动。</p><div className="sa-form-grid"><Field label="开始时间" hint="留空表示上线后即可展示。"><input type="datetime-local" value={localTime(form.starts_at)} onChange={e => update('starts_at', e.target.value ? new Date(e.target.value).toISOString() : null)}/></Field><Field label="结束时间" hint="到期自动停止展示，活动页标注已结束。"><input type="datetime-local" value={localTime(form.ends_at)} onChange={e => update('ends_at', e.target.value ? new Date(e.target.value).toISOString() : null)}/></Field></div></section>
    </div><aside className="sa-editor-aside"><div className="sa-panel"><span className="sa-tag">推广</span><h3>清楚区分每个入口</h3><p>推广始终带有标识，活动按钮与软件获取按钮分别显示。</p><p>广告到期、下线或加载失败，不影响软件和公告。</p><hr/><p>总开关：{data.settings.ads_enabled ? '已启用' : '已关闭'}</p><Link className="sa-text-link" href="/admin/station/promotions">管理广告总开关</Link></div></aside></div><SaveActions busy={busy} published={form.published} preview={() => setPreview(true)}/></form><Preview open={preview} close={() => setPreview(false)} title={form.title || '推广预览'}><span className="sa-tag">推广</span>{form.cover_url && <img src={form.cover_url} alt="推广封面"/>}<h3>{form.summary}</h3><p className="sa-prose">{form.body}</p>{safeLink(form.target_url) && <a className="st-button st-promotion-button" href={safeLink(form.target_url)} target="_blank" rel="noopener noreferrer">{form.action_label}<ExternalLink size={16}/></a>}<p className="sa-help">{form.placements.map(v => placements[v as keyof typeof placements]).join('、') || '仅独立活动页'}</p></Preview></div>;
}
