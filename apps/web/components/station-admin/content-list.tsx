'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { adviceMeta, categoryMeta, noticeText } from '@/lib/station-view';
import { SoftwareIcon } from '@/components/station/common';
import { Copy, date, errorText, Flash, Heading, labels, Pending, statuses, useStationAdmin } from './common';
import { announcementText, changed, openPublisher } from './publishing';

const types = { group: '群公告', usage: '使用提醒', maintenance: '维护通知' };
const importance = { normal: '普通', important: '重要', urgent: '紧急' };
const stateLabels: Record<string, string> = { published: '已发布', draft: '草稿', withdrawn: '已撤回', ended: '已结束' };
export function AdminList({ kind }: { kind: 'software' | 'releases' | 'announcements' }) {
  const { data, error, reload } = useStationAdmin();
  const [query, setQuery] = useState(''); const [softwareId, setSoftwareId] = useState(''); const [platform, setPlatform] = useState('');
  const [category, setCategory] = useState(''); const [advice, setAdvice] = useState(''); const [status, setStatus] = useState('');
  const [failure, setFailure] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState('');
  if (!data) return <Pending error={error} retry={reload}/>;
  const clear = () => { setQuery(''); setPlatform(''); setSoftwareId(''); setCategory(''); setAdvice(''); setStatus(''); };
  const match = (...values: string[]) => values.join(' ').toLowerCase().includes(query.trim().toLowerCase());
  const state = (r: { published: boolean; published_at: string | null; expired?: boolean }) => !r.published ? r.published_at ? 'withdrawn' : 'draft' : r.expired ? 'ended' : 'published';
  const software = data.software.filter(s => match(s.name, s.summary, s.aliases.join(' ')) && (!category || s.category === category) && (!platform || s.platforms.some(p => p === platform)) && (!status || String(s.published) === status));
  const releases = data.releases.filter(r => match(data.software.find(s => s.id === r.software_id)?.name || '', r.version, r.summary) && (!softwareId || r.software_id === softwareId) && (!platform || r.platform === platform) && (!advice || r.advice === advice) && (!status || state(r) === status));
  const announcements = data.announcements.filter(a => match(a.title, a.summary) && (!category || a.category === category) && (!status || state(a) === status));
  const count = kind === 'software' ? software.length : kind === 'releases' ? releases.length : announcements.length;
  const current = (id: string) => data.releases.filter(r => r.software_id === id && r.published).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')).filter((r, i, all) => all.findIndex(v => v.platform === r.platform) === i);
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  async function toggle(id: string, published: boolean) {
    if (!published && !window.confirm(kind === 'software' ? '下架后访客将无法查看软件和全部版本。内容保留，可重新上架。确认下架？' : '撤回后访客将无法查看，内容保留在后台。确认撤回？')) return;
    setBusy(id); setFailure(''); setSuccess('');
    try { await api(`/admin/station/${kind}/${id}`, { method: 'PATCH', body: JSON.stringify({ published }) }); setSuccess(published ? '已上架，前台已同步。' : kind === 'software' ? '软件已下架，可随时重新上架。' : '内容已撤回，前台已隐藏。'); changed(); }
    catch (e) { setFailure(errorText(e)); } finally { setBusy(''); }
  }
  const edit = (id: string, label = '编辑') => <Link className="sa-button sa-secondary" href={`/admin/station/${kind}/${id}`}>{label}</Link>;
  const tag = (value: string) => <span className={`sa-tag ${value === 'published' ? 'sa-published' : ''}`}>{stateLabels[value]}</span>;
  const columns = kind === 'software' ? ['软件', '分类 / 设备', '当前版本 / 建议', '看过 / 收藏（约）', '状态', '操作'] : kind === 'releases' ? ['软件 / 更新内容', '设备 / 版本', '建议 / 可用性', '状态 / 发布时间', '反馈 / 入口', '操作'] : ['公告', '类型 / 重要程度', '状态 / 发布时间', '有效期 / 看过', '操作'];
  return <div className="sa-page"><Heading title={{ software: '软件管理', releases: '版本与下载', announcements: '公告管理' }[kind]} description={kind === 'software' ? '固定入口长期保留，各设备、版本和安装教程分别维护。' : kind === 'releases' ? '每个版本独立保存下载入口，发布新版后仍可获取旧版。' : '重要消息可置顶、设置到期时间并关联软件。'} action={kind === 'software' ? <Link className="sa-button" href="/admin/station/software/new"><Plus size={18}/>添加软件</Link> : <button className="sa-button" onClick={() => openPublisher(kind === 'releases' ? 'release' : 'announcement')}><Plus size={18}/>{kind === 'releases' ? '发布更新' : '新建公告'}</button>}/><Flash error={failure || error} success={success}/>
    <div className="sa-list-filters"><label className="sa-search"><Search size={19}/><input aria-label="搜索管理内容" placeholder="搜索名称、别名或内容" value={query} onChange={e => setQuery(e.target.value)}/></label>
      {kind === 'releases' && <select aria-label="按软件筛选" value={softwareId} onChange={e => setSoftwareId(e.target.value)}><option value="">全部软件</option>{data.software.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
      {kind !== 'announcements' && <select aria-label="按设备筛选" value={platform} onChange={e => setPlatform(e.target.value)}><option value="">全部设备</option>{Object.entries(labels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {kind !== 'releases' && <select aria-label="按分类筛选" value={category} onChange={e => setCategory(e.target.value)}><option value="">全部分类</option>{Object.entries(kind === 'software' ? Object.fromEntries(Object.entries(categoryMeta).map(([k, v]) => [k, v.label])) : types).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>}
      {kind === 'releases' && <select aria-label="按更新建议筛选" value={advice} onChange={e => setAdvice(e.target.value)}><option value="">全部建议</option>{Object.entries(adviceMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>}
      <select aria-label="按发布状态筛选" value={status} onChange={e => setStatus(e.target.value)}><option value="">全部状态</option>{Object.entries(kind === 'software' ? { true: '已上架', false: '未上架' } : { published: '已发布', draft: '草稿', withdrawn: '已撤回', ...(kind === 'announcements' ? { ended: '已结束' } : {}) }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="sa-text-button" onClick={clear}>清除筛选</button>
    </div>
    <section className="sa-panel sa-list-panel"><div className="sa-list-caption">共 {count} 条内容</div>{count ? <div className="sa-table-wrap"><table className="sa-table sa-content-table"><thead><tr>{columns.map(c => <th key={c} scope="col">{c}</th>)}</tr></thead><tbody>
      {kind === 'software' && software.map(s => <tr key={s.id}><td><div className="sa-software-cell"><SoftwareIcon software={s}/><div><strong>{s.name}</strong><small>{s.summary}</small>{s.is_demo && <span className="sa-tag">示例</span>}</div></div></td><td>{categoryMeta[s.category]?.label}<small>{s.platforms.map(p => labels[p]).join('、')}</small></td><td>{current(s.id).length ? current(s.id).map(r => <div key={r.id}><span className="sa-mono">{r.version}</span><small>{labels[r.platform]} · {adviceMeta[r.advice].label}</small></div>) : '暂无版本'}</td><td>{s.view_count.toLocaleString()}<small>收藏 {s.favorite_count.toLocaleString()}</small></td><td><span className={`sa-tag ${s.published ? 'sa-published' : ''}`}>{s.published ? '已上架' : '未上架'}</span></td><td><div className="sa-action-row">{edit(s.id)}<button className="sa-button" onClick={() => openPublisher('release', s.id)}>发布更新</button><button className="sa-text-button" disabled={busy === s.id} onClick={() => toggle(s.id, !s.published)}>{s.published ? '下架' : '上架'}</button>{s.published && <Link className="sa-text-link" href={`/software/${s.slug}`} target="_blank" rel="noopener noreferrer">查看前台 ↗</Link>}</div></td></tr>)}
      {kind === 'releases' && releases.map(r => { const s = data.software.find(s => s.id === r.software_id); return <tr key={r.id}><td><strong>{s?.name}</strong><small>{r.summary}</small><small>看过约 {r.view_count || 0}</small></td><td>{labels[r.platform]}<small className="sa-mono">{r.version}</small></td><td><span className="sa-tag">{adviceMeta[r.advice].label}</span><small>{statuses[r.status]}</small></td><td>{tag(state(r))}<small>{date(r.published_at)}</small></td><td>{r.feedback_ok} 能用<small>{r.feedback_issue} 有问题 · {r.links.filter(l => l.is_active !== false).length} 个入口</small></td><td><div className="sa-action-row">{edit(r.id, '管理下载')}{r.published && s && <><Copy label="复制群通知" value={noticeText({ siteName: data.settings.site_name, software: s, release: r, stable: data.releases.find(v => v.id === r.stable_release_id), url: `${origin}/software/${s.slug}?platform=${r.platform}&release=${r.id}`, tip: data.settings.notice_tip })}/><button className="sa-text-button" disabled={busy === r.id} onClick={() => toggle(r.id, false)}>撤回</button></>}</div></td></tr>; })}
      {kind === 'announcements' && announcements.map(a => <tr key={a.id}><td><strong>{a.title}</strong><small>{a.summary}</small>{a.is_demo && <span className="sa-tag">示例</span>}</td><td>{types[a.category]}<small>{importance[a.importance]}{a.effective_pinned ? ' · 有效置顶' : ''}</small></td><td>{tag(state(a))}<small>{date(a.published_at)}</small></td><td>{a.expires_at ? date(a.expires_at) : '长期有效'}<small>看过约 {(a.view_count || 0).toLocaleString()}</small></td><td><div className="sa-action-row">{edit(a.id)}{a.published && <><Copy value={`/announcements/${a.slug}`}/><Copy label="复制群通知" value={announcementText(data.settings.site_name, a.title, a.body, `${origin}/announcements/${a.slug}`)}/><button className="sa-text-button" disabled={busy === a.id} onClick={() => toggle(a.id, false)}>撤回</button></>}</div></td></tr>)}
    </tbody></table></div> : <div className="sa-empty"><h2>没有找到相关内容</h2><p>换个关键词，或清除筛选再看看。</p><button className="sa-button sa-secondary" onClick={clear}>清除搜索和筛选</button></div>}</section>
  </div>;
}
