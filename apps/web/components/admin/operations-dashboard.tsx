"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, CheckCircle2, CircleHelp, Layers3, Megaphone, Plus, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { contentAdminPath, contentKinds, type DashboardData } from "@/lib/content-types";
import { errorMessage, isUnauthorized, Loading, Notice } from "./ui";

const missingNames: Record<string, string> = { official_link: "补充官方入口", version: "建立版本记录", guide: "编写使用指南", faq: "回答常见问题" };
function gapHref(softwareId: string, missing: string) { return missing === "version" ? `/admin/software/${softwareId}/versions` : missing === "guide" ? `/admin/guides/new?software_id=${softwareId}` : missing === "faq" ? `/admin/faqs/new?software_id=${softwareId}` : `/admin/software/${softwareId}`; }

export function OperationsDashboard() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [showAllGaps, setShowAllGaps] = useState(false);
  useEffect(() => {
    let current = true;
    api<DashboardData>(`/admin/dashboard?days=${days}`).then(value => { if (current) { setData(value); setError(""); } }).catch(cause => { if (!current) return; setData(null); if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [days, revision, router]);
  function reload() { setLoading(true); setError(""); setRevision(value => value + 1); }
  return <>
    <header className="adm-page-heading adm-operations-heading"><div><h1>运营工作台</h1><p>先完成待发布内容，再补齐用户寻找答案时遇到的缺口。</p></div><Link href="/admin/updates/new" className="adm-button"><Megaphone size={18} />新建公告</Link></header>
    <div className="adm-creation-links"><Link href="/admin/software/new"><Plus size={17} /><span>添加软件</span></Link><Link href="/admin/guides/new"><BookOpen size={17} /><span>编写指南</span></Link><Link href="/admin/faqs/new"><CircleHelp size={17} /><span>回答问题</span></Link><Link href="/admin/collections/new"><Layers3 size={17} /><span>整理合集</span></Link></div>
    {error && <Notice>{error}</Notice>}
    {loading ? <Loading text="正在读取待办与站点统计…" /> : !data ? <div className="adm-panel adm-empty"><h2>工作台数据暂时无法读取</h2><p>可以通过上方入口继续编辑内容，或重新加载真实统计。</p><button className="adm-button adm-button-secondary" onClick={reload}><RefreshCw size={17} />重新加载工作台</button></div> : <>
      <div className="adm-operations-totals"><Link href="/admin/updates"><strong>{data.totals.pending_updates}</strong><span>待处理公告</span></Link><a href="#pending-content"><strong>{data.totals.pending_content}</strong><span>待发布指南、问题与合集</span></a><Link href="/admin/software"><strong>{data.totals.published_software}</strong><span>已公开软件</span></Link></div>
      <div className="adm-operations-columns">
        <section className="adm-panel adm-operations-section" id="pending-content"><div className="adm-section-heading"><h2>待处理发布</h2><Link href="/admin/updates" className="adm-text-link">公告管理<ArrowUpRight size={14} /></Link></div><p className="adm-section-intro">先检查事实与行动建议，预览后再确认发布。</p>
          {!data.pending_updates.length && !data.pending_content.length ? <div className="adm-inline-empty"><CheckCircle2 size={23} /><p>目前没有待处理的发布内容。可以从补齐资料开始。</p></div> : <div className="adm-pending-list">{data.pending_updates.map(item => <Link key={item.id} href={`/admin/updates/${item.id}`}><span className="adm-pending-kind">公告</span><strong>{item.title}</strong><span>{item.status === "review" ? "待审核" : "草稿"}<ArrowUpRight size={14} /></span></Link>)}{data.pending_content.map(item => <Link key={item.id} href={contentAdminPath(item.kind, item.id)}><span className="adm-pending-kind">{contentKinds[item.kind].name}</span><strong>{item.title}</strong><span>{item.published_at ? "已下线" : "草稿"}<ArrowUpRight size={14} /></span></Link>)}</div>}
          <div className="adm-operations-footer"><Link href="/admin/guides?status=draft">待发布指南</Link><Link href="/admin/faqs?status=draft">待发布问题</Link><Link href="/admin/collections?status=draft">待发布合集</Link></div>
        </section>
        <section className="adm-panel adm-operations-section"><div className="adm-section-heading"><h2>软件内容缺口</h2><Link href="/admin/software" className="adm-text-link">软件管理<ArrowUpRight size={14} /></Link></div><p className="adm-section-intro">针对已公开软件补充入口、版本依据与使用解答。</p>{!data.gaps.length ? <div className="adm-inline-empty"><CheckCircle2 size={23} /><p>当前未发现待补充项。请继续定期核对内容是否准确。</p></div> : <div className="adm-gap-list">{data.gaps.slice(0, showAllGaps ? undefined : 6).map(item => <div key={item.software_id}><Link href={`/admin/software/${item.software_id}`}><strong>{item.name}</strong></Link><div>{item.missing.map(missing => <Link key={missing} href={gapHref(item.software_id, missing)}>{missingNames[missing] || "检查软件资料"}<Plus size={13} /></Link>)}</div></div>)}</div>}{data.gaps.length > 6 && <button type="button" className="adm-gap-more" aria-expanded={showAllGaps} onClick={() => setShowAllGaps(value => !value)}>{showAllGaps ? "收起其余缺口" : `再查看 ${data.gaps.length - 6} 款软件的缺口`}</button>}</section>
      </div>
      <div className="adm-analytics-heading"><div><h2>用户在找什么</h2><p>实际搜索与官方入口点击次数，同一用户重复操作也会计数。</p></div><label>统计范围<select aria-label="统计范围" value={days} onChange={event => { setDays(Number(event.target.value)); setLoading(true); setError(""); }}><option value="7">近 7 天</option><option value="30">近 30 天</option><option value="90">近 90 天</option></select></label></div>
      <div className="adm-analytics-totals"><span>搜索 <strong>{data.analytics.searches}</strong> 次</span><span>未找到结果 <strong>{data.analytics.no_result_searches}</strong> 次</span><span>前往官方 <strong>{data.analytics.official_clicks}</strong> 次</span></div>
      <div className="adm-operations-columns"><section className="adm-panel adm-operations-section"><div className="adm-section-heading"><h2>没有找到结果的搜索</h2></div>{!data.analytics.top_no_result_searches.length ? <div className="adm-inline-empty"><p>这段时间没有记录到无结果搜索。用户搜索未找到内容时，会在这里汇总。</p></div> : <div className="adm-table-scroll"><table className="adm-table adm-search-statistics"><thead><tr><th>搜索词 / 分组</th><th>搜索</th><th>无结果</th></tr></thead><tbody>{[...data.analytics.top_no_result_searches].sort((a, b) => b.no_result_searches - a.no_result_searches || b.searches - a.searches).map((item, index) => <tr key={`${item.query}-${item.scope}-${index}`}><td>{item.query}</td><td>{item.searches}</td><td>{item.no_result_searches}</td></tr>)}</tbody></table></div>}<p className="adm-page-note">含敏感信息的搜索词会被隐藏，仅展示经过清理的短语。可检查软件别名、用途，以及是否缺少对应解答。</p><div className="adm-operations-footer"><Link href="/admin/software">检查名称与别名</Link><Link href="/admin/faqs/new">补充常见问题</Link></div></section>
        <section className="adm-panel adm-operations-section"><div className="adm-section-heading"><h2>官方入口点击</h2></div>{!data.analytics.top_software.length ? <div className="adm-inline-empty"><p>这段时间没有官方入口点击记录。真实跳转发生后会在这里汇总。</p></div> : <div className="adm-click-list">{data.analytics.top_software.map(item => <Link key={item.software_id} href={`/admin/software/${item.software_id}`}><strong>{item.name}</strong><span>{item.clicks} 次<ArrowUpRight size={14} /></span></Link>)}</div>}{data.analytics.top_links.length > 0 && <details className="adm-stat-details"><summary>查看具体入口</summary>{data.analytics.top_links.map(item => <Link href={`/admin/software/${item.software_id}`} key={item.official_link_id}><span>{item.label}</span><strong>{item.clicks} 次</strong></Link>)}</details>}<p className="adm-page-note">点击量用于安排资料维护优先级，不代表下载完成、软件质量或用户人数。</p></section></div>
    </>}
  </>;
}
