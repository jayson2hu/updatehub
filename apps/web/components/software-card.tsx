import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import type { Software } from '@/lib/types';
import { SoftwareIcon } from './software-icon';
import { FollowButton } from './follow-button';
import { platformNames, levelNames } from '@/lib/format';
export function SoftwareCard({ software: s }: { software: Software }) {
  return <article className="software-card">
    <div className="card-heading"><SoftwareIcon name={s.name} src={s.icon_url}/><div><Link href={`/software/${s.slug}`} className="software-name">{s.short_name || s.name}</Link><span className="category-label">{s.category?.name || '其他工具'}</span></div><FollowButton id={s.id} name={s.name} compact/></div>
    <p className="software-summary">{s.summary}</p>
    <div className="platform-line">{s.platforms.slice(0, 4).map(p => <span key={p}>{platformNames[p] || p}</span>)}</div>
    <div className="card-footer"><span className={`version-label ${s.is_demo ? 'demo-version' : ''}`}>{s.is_demo ? '示例资料' : (s.latest_version ? `v${s.latest_version}` : '版本待确认')}{!s.is_demo && s.latest_version && <span className={`level-dot ${s.update_level}`}>{levelNames[s.update_level]}</span>}</span><Link href={`/software/${s.slug}`} className="card-link">查看软件 <ArrowUpRight size={16}/></Link></div>
  </article>;
}
