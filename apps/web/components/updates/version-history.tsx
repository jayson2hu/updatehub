import Link from 'next/link';
import { ArrowLeft, ArrowRight, History } from 'lucide-react';
import { api } from '@/lib/server-api';
import { levelNames } from '@/lib/format';
import type { Paginated, ReleaseUpdate, Software } from '@/lib/types';

export type HistoryParams = { history_page?: string | string[] };

function historyPage(value: HistoryParams['history_page']) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= 10000 ? page : 1;
}

export async function VersionHistory({ software, currentUpdate, page, base }: {
  software: Software;
  currentUpdate?: ReleaseUpdate;
  page?: HistoryParams['history_page'];
  base: string;
}) {
  const endpoint = `/software/${encodeURIComponent(software.slug)}/history`;
  let data = await api<Paginated<ReleaseUpdate>>(`${endpoint}?page=${historyPage(page)}&page_size=5`);
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  // Archived records can shrink the last page. Keep existing history links usable.
  if (data.page > pages) {
    data = await api<Paginated<ReleaseUpdate>>(`${endpoint}?page=${pages}&page_size=5`);
  }
  const href = (value: number) => `${base}?history_page=${value}#version-history`;

  return <section id="version-history" className="version-history" aria-labelledby="version-history-title">
    <header className="version-history-heading">
      <div><span className="version-history-eyebrow"><History size={15} aria-hidden="true"/> RELEASE HISTORY</span><h2 id="version-history-title">版本历史线</h2></div>
      <span className="version-history-count">已收录 {data.total} 条版本公告</span>
    </header>
    <p className="version-history-intro">按发布日期回看每次变化，打开公告了解当时的建议。同一天按首次收录时间倒序排列。</p>
    <div className="version-history-context">
      <span>档案当前记录{software.is_demo ? '（演示）' : ''}<strong>{software.latest_version || '尚未填写'}</strong></span>
      {currentUpdate?.kind === 'release' && <span>正在阅读<strong>{currentUpdate.version}</strong></span>}
    </div>
    {data.items.length ? <>
      <ol className="release-timeline" aria-label="按发布日期从新到旧的版本公告">
        {data.items.map(item => {
          const viewing = currentUpdate?.id === item.id;
          const sameFacts = software.latest_version === item.version && software.is_demo === item.is_demo && software.update_level === item.update_level && software.update_reason === item.reason_to_update;
          const recorded = sameFacts && !item.is_historical && (!software.current_release_id || software.current_release_id === item.id);
          const date = item.official_release_date || item.published_at?.slice(0, 10);
          return <li key={item.id} className={`release-timeline-item${viewing ? ' is-viewing' : ''}`} data-version={item.version} data-update-id={item.id} aria-current={viewing ? 'true' : undefined}>
            <div className="release-timeline-date"><time dateTime={date}>{date || '日期待确认'}</time><span>{item.official_release_date ? item.is_demo ? '演示发布日期' : '官方发布' : '站内首次发布（UTC）'}</span></div>
            <div className="release-timeline-node" aria-hidden="true"><span/></div>
            <div className="release-timeline-content">
              <div className="release-timeline-top"><h3>{item.version}</h3>{viewing && <span className="history-viewing-label">正在阅读</span>}{recorded && <span className="history-recorded-label">档案当前版本</span>}{item.is_historical && <span className="history-recorded-label">历史补录</span>}{item.is_demo && <span className="announcement-demo-label">演示公告</span>}</div>
              {item.previous_version && <div className="release-timeline-from">由 {item.previous_version} 更新</div>}
              <p className="release-timeline-title">{item.title}</p>
              {item.changes.length ? <ul className="release-timeline-changes">{item.changes.slice(0, 2).map((change, index) => <li key={index}>{change}</li>)}</ul> : <p className="release-timeline-summary">{item.summary}</p>}
              <div className="release-timeline-footer"><span className={`status-badge ${item.update_level}`}>{levelNames[item.update_level]}</span>{viewing ? <a className="text-link" href="#announcement-start">回到本条公告 <ArrowRight size={14}/></a> : <Link className="text-link" href={`/update/${encodeURIComponent(item.slug)}${data.page > 1 ? `?history_page=${data.page}` : ''}`} aria-label={`查看 ${item.version} 版本公告`}>查看版本公告 <ArrowRight size={14}/></Link>}</div>
            </div>
          </li>;
        })}
      </ol>
      {pages > 1 && <nav className="version-history-pagination" aria-label="版本历史分页">
        {data.page > 1 ? <Link href={href(data.page - 1)} className="button button-secondary"><ArrowLeft size={14}/>较新版本</Link> : <span/>}
        <span>第 {data.page} / {pages} 页</span>
        {data.page < pages ? <Link href={href(data.page + 1)} className="button button-secondary">更早版本<ArrowRight size={14}/></Link> : <span/>}
      </nav>}
      <p className="version-history-note">仅展示本站已公开的版本公告；未收录的版本请查阅官方发布记录。</p>
    </> : <div className="version-history-empty"><History size={23} aria-hidden="true"/><div><strong>还没有收录版本公告</strong><p>发布这款软件的版本公告后，会在这里形成更新历史。档案中的版本号不会自动生成历史记录。</p></div></div>}
  </section>;
}
