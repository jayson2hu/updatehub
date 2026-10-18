"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, Megaphone, Pencil, Pin, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Paginated, ReleaseUpdate } from "@/lib/types";
import { errorMessage, formatDate, isUnauthorized, Loading, Notice, Pagination } from "@/components/admin/ui";

const kindNames = { release: "版本更新", notice: "使用提醒", maintenance: "维护通知" };
const statusNames = { draft: "草稿", review: "待审核", published: "已发布", archived: "已归档" };
const levelNames = { critical: "紧急", recommended: "建议处理", optional: "一般", hold: "暂缓操作" };

export default function AnnouncementList() {
  const router = useRouter();
  const [data, setData] = useState<Paginated<ReleaseUpdate> | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [kind, setKind] = useState("");
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ page: String(page), page_size: "12" });
    if (query) params.set("q", query);
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    api<Paginated<ReleaseUpdate>>(`/admin/updates?${params}`).then(value => { if (current) setData(value); }).catch(cause => { if (!current) return; if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [query, status, kind, page, revision, router]);

  function reload() { setLoading(true); setError(""); setRevision(value => value + 1); }
  function filter(update: () => void) { setLoading(true); setError(""); setPage(1); update(); }
  function submit(event: FormEvent) { event.preventDefault(); if (search.trim() !== query || page !== 1) filter(() => setQuery(search.trim())); }

  return <>
    <header className="adm-page-heading"><div><h1>公告管理</h1><p>说明发生了什么、影响谁，以及接下来该怎么做。</p></div><Link href="/admin/updates/new" className="adm-button"><Plus size={18} />新建公告</Link></header>
    {error && <Notice>{error}</Notice>}
    <section className="adm-panel"><form className="adm-toolbar adm-update-toolbar" onSubmit={submit}><div className="adm-search"><Search size={18} /><input aria-label="搜索公告" value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索公告标题或内容" /><button className="adm-button adm-button-secondary adm-button-small" type="submit">搜索</button></div><select aria-label="公告类型筛选" value={kind} onChange={event => filter(() => setKind(event.target.value))}><option value="">全部类型</option>{Object.entries(kindNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select><select aria-label="公告状态筛选" value={status} onChange={event => filter(() => setStatus(event.target.value))}><option value="">全部状态</option>{Object.entries(statusNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></form>
      {loading ? <Loading text="正在读取公告…" /> : error ? <div className="adm-empty"><p>暂时无法读取公告列表。</p><button className="adm-button adm-button-secondary" onClick={reload}>重新加载</button></div> : data?.items.length ? <><div className="adm-update-list">{data.items.map(item => <article className="adm-update-row" key={item.id}><div className="adm-update-row-main"><div className="adm-update-meta"><span className="adm-update-kind">{kindNames[item.kind]}</span><span className={`adm-update-level adm-update-level-${item.update_level}`}>{levelNames[item.update_level]}</span>{item.is_pinned && <span className="adm-update-pin"><Pin size={12} />置顶</span>}{item.is_demo && <span className="adm-demo-label">演示公告</span>}</div><Link href={`/admin/updates/${item.id}`} className="adm-update-title">{item.title}</Link><p>{item.summary || "摘要尚未填写"}</p><div className="adm-update-foot"><span>{item.software?.name || "通用公告"}{item.version ? ` · ${item.version}` : ""}</span><span>修改于 {formatDate(item.updated_at)}</span></div></div><div className="adm-update-row-side"><span className={`adm-status adm-status-${item.status === "published" ? "published" : item.status === "review" ? "review" : "draft"}`}><span />{statusNames[item.status]}</span><div className="adm-row-actions"><Link href={`/admin/updates/${item.id}`} className="adm-button adm-button-secondary adm-button-small" aria-label={`编辑公告 ${item.title}`}><Pencil size={14} />编辑</Link>{item.status === "published" && <Link href={`/update/${item.slug}`} className="adm-icon-button" target="_blank" rel="noopener noreferrer" title="查看公开公告" aria-label={`查看公告 ${item.title}（新标签页）`}><ArrowUpRight size={17} /></Link>}</div></div></article>)}</div><Pagination page={page} total={data.total} pageSize={12} onChange={value => { setLoading(true); setError(""); setPage(value); }} /></> : <div className="adm-empty"><Megaphone size={36} /><h2>{query || kind || status ? "没有符合条件的公告" : "发布第一条公告"}</h2><p>{query || kind || status ? "调整搜索词或筛选条件，再试一次。" : "从版本更新、使用提醒或维护通知开始，让用户及时了解变化。"}</p>{query || kind || status ? <button className="adm-button adm-button-secondary" onClick={() => filter(() => { setQuery(""); setSearch(""); setKind(""); setStatus(""); })}>清除筛选</button> : <Link href="/admin/updates/new" className="adm-button">新建公告</Link>}</div>}
    </section><p className="adm-page-note">草稿和待审核公告仅管理员可见。发布需要人工确认；归档后会从公开站点移除。</p>
  </>;
}
