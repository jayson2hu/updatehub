'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { BookmarkPlus, CheckCircle2, ArrowUpRight } from 'lucide-react';
import type { CollectionItem } from '@/lib/content-types';
import { useMySoftware } from '@/hooks/use-my-software';
import { SoftwareIcon } from '@/components/software-icon';
import { FollowStorageNotice } from '@/components/follow-storage-notice';
import { platformNames } from '@/lib/format';
const importance = { required: '场景必需', recommended: '推荐', optional: '按需' };

export function CollectionSelection({ items, title, platform = '', onboarding = false }: { items: CollectionItem[]; title: string; platform?: string; onboarding?: boolean }) {
  const { contains, followMany, ids } = useMySoftware();
  const [selected, setSelected] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [filter, setFilter] = useState(platform);
  const feedback = useRef<HTMLDivElement>(null);
  const visible = items.filter(item => !filter || item.software.platforms.includes(filter) || item.software.platforms.includes('web'));
  const chosen = visible.filter(item => selected.includes(item.software_id) && !contains(item.software_id)).map(item => item.software_id);
  function save() {
    if (!chosen.length) return;
    if (ids.length + chosen.length > 500) { setMessage('关注清单最多保存 500 款软件，请先在“我的关注”中整理清单。'); return; }
    const persisted = followMany(chosen);
    setMessage(persisted ? `已将 ${chosen.length} 款软件加入我的关注。之后可集中查看它们的公告。` : `已临时关注 ${chosen.length} 款软件。浏览器暂时无法保存，刷新或关闭页面后会丢失。请允许本站保存数据后重新添加。`);
    setSelected([]); setDone(true);
    window.setTimeout(() => { feedback.current?.focus(); feedback.current?.scrollIntoView({ block: 'center', behavior: 'instant' }); }, 0);
  }
  return <section className={`collection-selection${chosen.length ? ' has-selection' : ''}`} aria-label={`${title}软件清单`}>
    <div className="selection-heading"><div><h2>{onboarding ? '选择你想关注的软件' : '按需选择软件'}</h2><p>{onboarding ? '勾选自己会用到的软件，今后集中查看相关公告。' : '合集提供选择理由。你可以只关注需要的软件。'}</p></div>{!onboarding && <label>适用系统<select aria-label="合集适用系统" value={filter} onChange={event => { setFilter(event.target.value); setMessage(''); setDone(false); }}><option value="">全部系统</option>{Object.entries(platformNames).filter(([key]) => key !== 'web').map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>}</div>
    {visible.length ? <><div className="selection-tools"><button type="button" onClick={() => { setSelected(visible.filter(item => !contains(item.software_id)).map(item => item.software_id)); setDone(false); }}>选择全部未关注软件</button><button type="button" onClick={() => setSelected([])}>清空选择</button><span>{visible.length} 款软件</span></div><div className="selection-list">{visible.map(item => { const followed = contains(item.software_id); return <div className={`selection-row ${followed ? 'is-followed' : ''}`} key={item.software_id}><label className="selection-checkbox"><input type="checkbox" aria-label={`选择 ${item.software.name}`} checked={followed || selected.includes(item.software_id)} disabled={followed} onChange={event => { setSelected(event.target.checked ? [...selected, item.software_id] : selected.filter(id => id !== item.software_id)); setDone(false); }}/><SoftwareIcon name={item.software.name} src={item.software.icon_url} size={40}/></label><div className="selection-content"><div><Link href={`/software/${item.software.slug}`}>{item.software.name}</Link><span>{followed ? '已关注' : importance[item.importance]}</span></div><p>{item.note || item.software.summary}</p><small>{item.software.platforms.map(value => platformNames[value] || value).join(' / ')}{item.software.is_demo && ' · 示例软件资料'}</small><Link className="text-link selection-detail" href={`/software/${item.software.slug}`}>查看版本与官方入口<ArrowUpRight size={14}/></Link></div></div>; })}</div><div className="selection-action"><button type="button" className="button button-primary" disabled={!chosen.length} onClick={save}><BookmarkPlus size={18}/>关注选中的 {chosen.length} 款软件</button><Link href="/my-software" className="button button-secondary">{done || visible.every(item => contains(item.software_id)) ? '查看我的关注' : '已有关注，直接查看'}</Link></div></> : <div className="help-empty"><h3>此清单暂未收录适合该系统的软件</h3><p>可以选择其他系统，或从软件档案继续查找。</p><Link href={`/software${filter ? `?platform=${filter}` : ''}`} className="text-link">按系统查找软件</Link></div>}
    {message && <div ref={feedback} className="selection-result" role="status" tabIndex={-1}><CheckCircle2 size={20}/><div><p>{message}</p>{done && <Link href="/my-software" className="text-link">查看已关注软件的公告</Link>}</div></div>}<FollowStorageNotice/>
  </section>;
}
