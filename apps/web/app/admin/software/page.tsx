"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Plus, Search, Pencil, Archive, ArrowUpRight, PackageOpen } from "lucide-react";
import { api } from "@/lib/api";
import type { Category, Software, Paginated } from "@/lib/types";
import { ConfirmDialog, errorMessage, formatDate, isUnauthorized, Loading, Notice, Pagination, SoftwareIcon } from "@/components/admin/ui";

const pageSize = 12;

export default function SoftwareListPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [data, setData] = useState<Paginated<Software> | null>(null);
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState<Software | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => { api<Category[]>("/categories").then(setCategories).catch(cause => setError(errorMessage(cause))); }, []);
  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    if (query) params.set("q", query);
    if (category) params.set("category", category);
    api<Paginated<Software>>(`/admin/software?${params}`).then(result => {
      if (!current) return;
      if (!result.items.length && page > 1) setPage(page - 1);
      else setData(result);
    }).catch(cause => { if (current) { if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); } }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, category, page, revision, router]);

  function reload() { setLoading(true); setError(""); setRevision(value => value + 1); }
  function changePage(value: number) { setLoading(true); setError(""); setPage(value); }
  function submitSearch(event: FormEvent) { event.preventDefault(); if (query !== search.trim() || page !== 1) { setLoading(true); setError(""); setQuery(search.trim()); setPage(1); } }
  async function archive() {
    if (!selected) return;
    setDeleting(true); setError("");
    try { await api(`/admin/software/${selected.id}`, { method: "DELETE" }); setSuccess(`“${selected.name}”已下线，公开站点将不再展示。`); setSelected(null); reload(); }
    catch (cause) { setSelected(null); if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }
    finally { setDeleting(false); }
  }

  return <>
    <header className="adm-page-heading"><div><h1>软件管理</h1><p>让资料准确，让每一个官方入口都清楚可见。</p></div><Link href="/admin/software/new" className="adm-button"><Plus size={18} />添加软件</Link></header>
    {success && <Notice success>{success}</Notice>}{error && <Notice>{error}</Notice>}
    <section className="adm-panel">
      <form className="adm-toolbar" onSubmit={submitSearch}><div className="adm-search"><Search size={18} /><input aria-label="搜索软件" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索名称、别名或用途" /><button type="submit" className="adm-button adm-button-secondary adm-button-small">搜索</button></div><select aria-label="筛选分类" value={category} onChange={event => { setLoading(true); setError(""); setCategory(event.target.value); setPage(1); }}><option value="">全部分类</option>{categories.map(item => <option key={item.id} value={item.slug}>{item.name}</option>)}</select></form>
      {loading ? <Loading text="正在读取软件资料…" /> : error && !data ? <div className="adm-empty"><p>暂时无法读取软件列表。</p><button className="adm-button adm-button-secondary" onClick={reload}>重新加载</button></div> : data?.items.length ? <>
        <div className="adm-table-scroll"><table className="adm-table adm-software-table"><thead><tr><th>软件</th><th>分类 / 平台</th><th>版本</th><th>公开状态</th><th>最后修改</th><th className="adm-table-actions">操作</th></tr></thead><tbody>{data.items.map(item => <tr key={item.id}>
          <td><Link href={`/admin/software/${item.id}`} className="adm-software-cell"><SoftwareIcon url={item.icon_url} name={item.name} /><span><strong>{item.name}</strong><small>{item.summary || item.slug}</small></span></Link></td>
          <td><span>{item.category?.name || "未分类"}</span><small className="adm-cell-secondary">{item.platforms.join(" / ") || "未设置平台"}</small></td>
          <td><span>{item.latest_version || "未填写"}</span>{item.is_demo && <small className="adm-demo-label">示例版本</small>}</td>
          <td><span className={`adm-status ${item.published ? "adm-status-published" : "adm-status-draft"}`}><span />{item.published ? "已发布" : "未发布"}</span></td>
          <td className="adm-nowrap">{formatDate(item.updated_at)}</td>
          <td><div className="adm-row-actions"><Link className="adm-version-management-link" href={`/admin/software/${item.id}/versions`}>版本管理</Link><Link className="adm-icon-button" href={`/admin/software/${item.id}`} aria-label={`编辑 ${item.name}`} title="编辑资料"><Pencil size={16} /></Link>{item.published && <><Link className="adm-icon-button" href={`/software/${item.slug}`} target="_blank" rel="noopener noreferrer" aria-label={`查看 ${item.name} 公开页面（新标签页）`} title="查看公开页面"><ArrowUpRight size={17} /></Link><button type="button" className="adm-icon-button adm-danger-text" onClick={() => setSelected(item)} aria-label={`下线 ${item.name}`} title="下线软件"><Archive size={16} /></button></>}</div></td>
        </tr>)}</tbody></table></div>
        <Pagination page={page} pageSize={pageSize} total={data.total} onChange={changePage} />
      </> : <div className="adm-empty"><PackageOpen size={34} /><h2>{query || category ? "没有找到匹配的软件" : "从第一款软件开始"}</h2><p>{query || category ? "试试其他名称、别名，或清除分类筛选。" : "添加软件资料和官方入口，即可开始维护。"}</p>{query || category ? <button className="adm-button adm-button-secondary" type="button" onClick={() => { setLoading(true); setError(""); setQuery(""); setSearch(""); setCategory(""); setPage(1); }}>清除筛选</button> : <Link href="/admin/software/new" className="adm-button"><Plus size={17} />添加软件</Link>}</div>}
    </section>
    <p className="adm-page-note">未发布的软件仅在后台可见。下线会保留资料，之后可在编辑页重新发布。</p>
    <ConfirmDialog open={!!selected} title={`下线“${selected?.name || ""}”？`} busy={deleting} onClose={() => setSelected(null)} onConfirm={archive}><p>下线后，这款软件和它的官方入口将从公开站点隐藏。软件资料会保留，可以再次发布。</p></ConfirmDialog>
  </>;
}
