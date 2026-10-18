import Link from 'next/link';
import { ArrowRight, Megaphone, Pin, Clock3 } from 'lucide-react';
import type { ReleaseUpdate } from '@/lib/types';
import { announcementDate, announcementKinds, announcementLevel } from '@/lib/format';
import { SoftwareIcon } from '@/components/software-icon';
import { isHistoricalRelease } from '@/lib/release-status';

export function UpdateCard({ update: u }: { update: ReleaseUpdate }) {
  const historical = isHistoricalRelease(u);
  return <article className={`announcement-card ${u.is_pinned ? 'announcement-pinned' : ''}`} data-kind={u.kind} data-demo={u.is_demo} data-software={u.software_id || ''}>
    <div className="announcement-symbol">{u.software ? <SoftwareIcon name={u.software.name} src={u.software.icon_url} size={42}/> : <span className="general-notice-icon"><Megaphone size={23}/></span>}</div>
    <div className="announcement-body">
      <div className="announcement-meta">
        {u.is_pinned && <span className="pin-label"><Pin size={12}/>置顶</span>}
        <span className={`notice-kind ${u.kind}`}>{announcementKinds[u.kind]}</span>
        {historical && <span className="history-recorded-label">{u.is_historical ? '历史补录' : '历史版本'}</span>}
        <span className={`status-badge ${u.update_level}`}>{announcementLevel(u.kind, u.update_level)}</span>
        {u.is_demo && <span className="announcement-demo-label">演示公告</span>}
      </div>
      <h2><Link href={`/update/${u.slug}`}>{u.title}</Link></h2>
      <p className="announcement-summary">{u.summary}</p>
      <div className="announcement-action"><span>{historical ? '当时的建议' : '行动建议'}</span><p>{u.reason_to_update}</p></div>
      <div className="announcement-bottom"><div>{u.software ? <Link className="announcement-source" href={`/software/${u.software.slug}`}>{u.software.short_name || u.software.name}</Link> : <span className="announcement-source">站点公告</span>}{u.kind === 'release' && u.version && <span className="announcement-version">{u.previous_version ? `${u.previous_version} → ` : ''}{u.version}</span>}<time dateTime={u.official_release_date || u.published_at || undefined}><Clock3 size={12}/>{u.official_release_date || announcementDate(u.published_at,true)}</time></div><Link href={`/update/${u.slug}`} className="read-announcement">阅读公告 <ArrowRight size={15}/></Link></div>
    </div>
  </article>;
}
