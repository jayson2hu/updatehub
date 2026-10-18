'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { api } from '@/lib/api';
import { SoftwareIcon } from '@/components/station/common';
import { Copy, date, errorText, Flash, Heading, labels, Pending, statuses, useStationAdmin } from './common';

export function AdminList({ kind }: { kind: 'software' | 'releases' | 'announcements' }) {
  const { data, error, reload } = useStationAdmin();
  const [query, setQuery] = useState(''); const [softwareId, setSoftwareId] = useState(''); const [platform, setPlatform] = useState('');
  const [failure, setFailure] = useState(''); const [success, setSuccess] = useState(''); const [busy, setBusy] = useState('');
  if (!data) return <Pending error={error} retry={reload}/>;
  async function withdraw(id: string) {
    if (!window.confirm(kind === 'software' ? '下架后，访客将无法访问该软件及全部版本。确认下架？' : kind === 'releases' ? '撤回后，此版本将不再公开。其他版本继续可用。确认撤回？' : '撤回后，访客将无法访问这条公告。确认撤回？')) return;
    setBusy(id); setFailure('');
    try { await api(`/admin/station/${kind}/${id}`, { method: 'PATCH', body: JSON.stringify({ published: false }) }); setSuccess(kind === 'software' ? '软件已下架，内容仍然保留。' : '内容已撤回为草稿。'); reload(); }
    catch (cause) { setFailure(errorText(cause)); } finally { setBusy(''); }
  }
  const names = { software: '软件管理', releases: '版本与下载', announcements: '群公告' };
  const items = kind === 'software' ? data.software.map(s => ({ id: s.id, title: s.name, summary: s.summary, sub: s.platforms.map(p => labels[p]).join('、'), published: s.published, path: `/software/${s.slug}`, software: s, versionTag: '' })) : kind === 'releases' ? data.releases.filter(r => (!softwareId || r.software_id === softwareId) && (!platform || r.platform === platform)).map(r => {
    const s = data.software.find(s => s.id === r.software_id);
    const latest = data.releases.filter(v => v.published && v.software_id === r.software_id && v.platform === r.platform).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''))[0];
    return { id: r.id, title: `${s?.name || '软件'} v${r.version.replace(/^v/i, '')}`, summary: r.summary, sub: `${labels[r.platform]} · ${date(r.published_at)} · ${statuses[r.status]} · ${r.links.length ? `${r.links.length} 个获取入口` : '未配置获取链接'}`, published: r.published, path: `/software/${s?.slug}?platform=${r.platform}&release=${r.id}`, software: undefined, versionTag: !r.published ? '' : latest?.id === r.id ? '最新版' : '历史版' };
  }) : data.announcements.map(a => ({ id: a.id, title: a.title, summary: a.summary, sub: `${a.effective_pinned ? '有效置顶 · ' : ''}${a.expired ? '已结束 · ' : ''}${date(a.published_at)}`, published: a.published, path: `/announcements/${a.slug}`, software: undefined, versionTag: '' }));
  const filtered = items.filter(item => (item.title + item.summary).toLowerCase().includes(query.trim().toLowerCase()));
  return <div className="sa-page"><Heading title={names[kind]} description={kind === 'software' ? '每款软件保留一个固定入口，各设备和版本分别维护。' : kind === 'releases' ? '新旧版本独立提供下载。修改或停用一个版本，不影响其他版本。' : '重要提醒集中发布，支持置顶、到期和关联软件。'} action={<Link href={`/admin/station/${kind}/new`} className="sa-button"><Plus size={18}/>{kind === 'software' ? '添加软件' : kind === 'releases' ? '发布更新' : '新建公告'}</Link>}/><Flash error={failure || error} success={success}/>
    <div className="sa-list-filters"><label className="sa-search"><Search size={19}/><input aria-label="搜索管理内容" placeholder="搜索名称或更新内容" value={query} onChange={e => setQuery(e.target.value)}/></label>{kind === 'releases' && <><select aria-label="按软件筛选版本" value={softwareId} onChange={e => setSoftwareId(e.target.value)}><option value="">全部软件</option>{data.software.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select aria-label="按设备筛选版本" value={platform} onChange={e => setPlatform(e.target.value)}><option value="">全部设备</option>{Object.entries(labels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></>}</div>
    <div className="sa-panel sa-list-panel"><div className="sa-list-caption">{filtered.length} 条{kind === 'releases' ? '版本记录' : '内容'}</div>{filtered.length ? filtered.map(item => <article className="sa-record sa-list-record" key={item.id}>{item.software && <SoftwareIcon software={item.software}/>}<div className="sa-record-copy"><div className="sa-title-line"><Link href={`/admin/station/${kind}/${item.id}`}><strong>{item.title}</strong></Link><span className={`sa-tag ${item.published ? 'sa-published' : ''}`}>{item.published ? '已发布' : '草稿'}</span>{item.versionTag && <span className="sa-tag">{item.versionTag}</span>}</div><p>{item.summary}</p><small>{item.sub}</small></div><div className="sa-record-actions">{kind === 'software' && <Link className="sa-button" href={`/admin/station/releases/new?software=${item.id}`}>发布更新</Link>}<Link className="sa-button sa-secondary" href={`/admin/station/${kind}/${item.id}`}>{kind === 'releases' ? '管理下载' : '编辑'}</Link>{item.published && <><Copy value={item.path}/><button className="sa-text-button" disabled={busy === item.id} onClick={() => withdraw(item.id)}>{kind === 'software' ? '下架' : '撤回'}</button></>}</div></article>) : <div className="sa-empty"><h2>没有找到相关内容</h2><p>换个关键词，或清除筛选后再看看。</p><button className="sa-button sa-secondary" onClick={() => { setQuery(''); setPlatform(''); setSoftwareId(''); }}>清除搜索和筛选</button></div>}</div>
  </div>;
}
