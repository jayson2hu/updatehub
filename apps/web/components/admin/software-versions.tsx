"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, History, Pencil, Plus, Upload } from "lucide-react";
import { api } from "@/lib/api";
import type { Paginated, ReleaseUpdate, Software } from "@/lib/types";
import { errorMessage, isUnauthorized, Loading, Notice, Pagination, SoftwareIcon } from "./ui";

const states = { draft: "草稿", review: "待审核", published: "已发布", archived: "已归档" };

export function SoftwareVersions({ softwareId }: { softwareId: string }) {
  const router = useRouter();
  const [software, setSoftware] = useState<Software | null>(null);
  const [data, setData] = useState<Paginated<ReleaseUpdate> | null>(null);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ page: String(page), page_size: "10" });
    if (status) params.set("status", status);
    Promise.all([api<Software>(`/admin/software/${softwareId}`), api<Paginated<ReleaseUpdate>>(`/admin/software/${softwareId}/history?${params}`)]).then(([item, history]) => { if (active) { setSoftware(item); setData(history); setError(""); } }).catch(cause => { if (!active) return; setData(null); if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [softwareId, page, status, revision, router]);

  if (loading && !software) return <Loading text="正在读取软件的版本记录…" />;
  if (!software) return <><Notice>{error || "软件资料暂时无法读取。"}</Notice><button className="adm-button" onClick={() => { setError(""); setLoading(true); setRevision(value => value + 1); }}>重新加载</button></>;
  const create = `/admin/updates/new?software_id=${encodeURIComponent(software.id)}`;
  return <>
    <Link href="/admin/software" className="adm-back"><ArrowLeft size={16} />返回软件管理</Link>
    <header className="adm-version-workbench-heading"><SoftwareIcon name={software.name} url={software.icon_url} /><div><h1>{software.name} · 版本管理</h1><p>发布新版本，补齐历史记录，持续维护这款软件的更新。</p></div><Link href={`/admin/software/${software.id}`} className="adm-button adm-button-secondary"><Pencil size={15} />编辑软件资料</Link></header>
    {error && <Notice>{error}</Notice>}
    {!software.published && <Notice>软件资料尚未公开。可以先准备版本草稿，发布版本前请到“编辑软件资料”开启公开展示。</Notice>}
    <div className="adm-version-overview"><div><span>档案当前版本{software.is_demo ? "（演示）" : ""}</span><strong>{software.latest_version || "尚未发布版本"}</strong><small>{software.current_release_id ? "由版本公告维护" : software.latest_version ? "已有档案记录，尚未关联版本公告" : "发布首个版本后在这里显示"}</small></div><div><span>软件公开状态</span><strong className="adm-overview-status">{software.published ? "已公开" : "未公开"}</strong>{software.published && <Link href={`/software/${software.slug}#version-history`} target="_blank" rel="noopener noreferrer" className="adm-text-link">查看公开版本历史<ArrowUpRight size={13} /></Link>}</div></div>
    <div className="adm-version-entrypoints"><Link href={`${create}&mode=release`} className="adm-version-entry"><span className="adm-version-entry-icon"><Upload size={22} /></span><span><strong>发布新版本</strong><small>记录本次更新，发布后按版本规则更新档案当前版本。</small></span><Plus size={19} /></Link><Link href={`${create}&mode=history`} className="adm-version-entry"><span className="adm-version-entry-icon"><History size={22} /></span><span><strong>补录历史版本</strong><small>补齐以前的版本记录，不改变档案当前版本。</small></span><Plus size={19} /></Link></div>
    <section className="adm-panel"><div className="adm-toolbar adm-version-toolbar"><h2>版本记录 <span>{data?.total || 0}</span></h2><select aria-label="版本状态筛选" value={status} onChange={event => { setLoading(true); setError(""); setStatus(event.target.value); setPage(1); }}><option value="">全部状态</option>{Object.entries(states).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div>
      {loading ? <Loading /> : error ? <div className="adm-empty"><h2>版本记录暂时无法读取</h2><p>当前筛选尚未加载成功，请重试。</p><button type="button" className="adm-button" onClick={() => { setLoading(true); setError(""); setRevision(value => value + 1); }}>重新加载版本记录</button></div> : data?.items.length ? <><div className="adm-version-records">{data.items.map(item => <article key={item.id} className="adm-version-record"><div><div className="adm-update-meta"><span className={`adm-status adm-status-${item.status === "published" ? "published" : item.status === "review" ? "review" : "draft"}`}><span />{states[item.status]}</span>{item.is_historical && <span className="adm-update-kind">历史补录</span>}{item.is_demo && <span className="adm-demo-label">演示</span>}{software.current_release_id === item.id && <span className="adm-version-current">当前版本依据</span>}</div><h3><Link href={`/admin/updates/${item.id}`}>{item.version || "尚未填写版本号"}</Link></h3><p>{item.title}</p><small>{item.official_release_date ? `官方发布日期 ${item.official_release_date}` : "尚未填写官方发布日期"}{item.previous_version ? ` · 上一版本 ${item.previous_version}` : ""}</small></div><div className="adm-row-actions"><Link href={`/admin/updates/${item.id}`} className="adm-button adm-button-secondary adm-button-small">{item.status === "draft" || item.status === "review" ? "继续编辑" : "查看 / 编辑"}</Link>{item.status === "published" && <Link href={`/update/${item.slug}`} className="adm-icon-button" target="_blank" rel="noopener noreferrer" aria-label={`查看 ${item.version} 的公开公告`}><ArrowUpRight size={17} /></Link>}</div></article>)}</div><Pagination page={page} total={data.total} pageSize={10} onChange={value => { setLoading(true); setError(""); setPage(value); }} /></> : <div className="adm-empty"><History size={32} /><h2>{status ? "没有这个状态的版本" : "这款软件还没有版本记录"}</h2><p>{status ? "切换到全部状态，或新建版本草稿。" : "从“发布新版本”开始；以前的版本通过“补录历史版本”添加。软件资料中的原版本号不会自动变成历史记录。"}</p>{!status && <Link href={`${create}&mode=release`} className="adm-button"><Plus size={16} />发布第一个版本</Link>}</div>}
    </section>
  </>;
}
