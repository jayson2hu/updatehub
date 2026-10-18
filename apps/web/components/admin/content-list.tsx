"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowUpRight, BookOpen, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import { contentAdminPath, contentKinds, contentPublicPath, type ContentDocument, type ContentKind } from "@/lib/content-types";
import type { Paginated } from "@/lib/types";
import { errorMessage, formatDate, isUnauthorized, Loading, Notice, Pagination } from "./ui";

const statusNames = { draft: "草稿 / 已下线", published: "已发布", archived: "已归档" };

export function ContentList({ kind, initialStatus = "", initialQuery = "" }: { kind: ContentKind; initialStatus?: string; initialQuery?: string }) {
  const router = useRouter();
  const config = contentKinds[kind];
  const [search, setSearch] = useState(initialQuery);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [data, setData] = useState<Paginated<ContentDocument> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let current = true;
    const params = new URLSearchParams({ kind, page: String(page), page_size: "12" });
    if (query) params.set("q", query);
    if (status) params.set("status", status);
    api<Paginated<ContentDocument>>(`/admin/content?${params}`).then(value => { if (current) { setData(value); setError(""); } }).catch(cause => { if (!current) return; setData(null); if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, query, status, page, revision, router]);

  function reload() { setLoading(true); setError(""); setRevision(value => value + 1); }
  function submit(event: FormEvent) { event.preventDefault(); setLoading(true); setError(""); setQuery(search.trim()); setPage(1); setRevision(value => value + 1); }
  return <>
    <header className="adm-page-heading"><div><h1>{config.heading}</h1><p>{config.description}</p></div><Link className="adm-button" href={contentAdminPath(kind, "new")}><Plus size={18} />{kind === "faq" ? "添加问题" : `新建${config.name}`}</Link></header>
    {error && <Notice>{error}</Notice>}
    <section className="adm-panel">
      <form className="adm-toolbar adm-content-toolbar" onSubmit={submit}><div className="adm-search"><Search size={18} /><input aria-label={`搜索${config.name}`} value={search} onChange={event => setSearch(event.target.value)} placeholder={kind === "faq" ? "搜索问题或答案" : "搜索标题或内容"} /><button className="adm-button adm-button-secondary" type="submit">搜索</button></div><select aria-label="内容状态筛选" value={status} onChange={event => { setStatus(event.target.value); setPage(1); setLoading(true); setError(""); }}><option value="">全部状态</option>{Object.entries(statusNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></form>
      {loading ? <Loading text={`正在读取${config.name}…`} /> : error ? <div className="adm-empty"><h2>内容列表暂时无法读取</h2><p>筛选结果尚未加载成功，重试后再继续。</p><button type="button" className="adm-button adm-button-secondary" onClick={reload}>重新加载</button></div> : data?.items.length ? <>
        <div className="adm-content-list">{data.items.map(item => <article className="adm-content-row" key={item.id}><div><div className="adm-content-row-meta"><span className={`adm-status adm-status-${item.status === "published" ? "published" : "draft"}`}><span />{item.status === "draft" && item.published_at ? "已下线" : item.status === "draft" ? "草稿" : statusNames[item.status]}</span>{item.is_demo && <span className="adm-demo-label">演示内容</span>}{item.software && <span>{item.software.name}</span>}{kind === "collection" && <span>{item.items.length} 款软件</span>}</div><h2><Link href={contentAdminPath(kind, item.id)}>{item.title}</Link></h2><p>{item.summary || "尚未填写简介"}</p><small>最后修改 {formatDate(item.updated_at)}</small></div><div className="adm-content-row-actions"><Link className="adm-button adm-button-secondary" href={contentAdminPath(kind, item.id)}>{item.status === "published" ? "查看 / 管理" : item.status === "archived" ? "查看 / 恢复" : "继续编辑"}</Link>{item.status === "published" && <Link className="adm-icon-button" href={contentPublicPath(item)} target="_blank" rel="noopener noreferrer" aria-label={`查看“${item.title}”公开页面`}><ArrowUpRight size={18} /></Link>}</div></article>)}</div>
        <Pagination page={page} pageSize={12} total={data.total} onChange={value => { setPage(value); setLoading(true); setError(""); }} />
      </> : <div className="adm-empty"><BookOpen size={32} /><h2>{query || status ? "没有匹配的内容" : `还没有${config.name}`}</h2><p>{query || status ? "试试其他关键词，或清除状态筛选。" : kind === "guide" ? "从用户最常遇到的任务开始，写下一份可照着操作的指南。" : kind === "faq" ? "先回答一个反复出现的问题。保存草稿后，可预览并确认发布。" : "按一个具体需求整理软件，并为每款软件写下选择理由。"}</p>{query || status ? <button type="button" className="adm-button adm-button-secondary" onClick={() => { setSearch(""); setQuery(""); setStatus(""); setPage(1); reload(); }}>清除筛选</button> : <Link href={contentAdminPath(kind, "new")} className="adm-button"><Plus size={17} />{kind === "faq" ? "添加第一个问题" : `新建${config.name}`}</Link>}</div>}
    </section><p className="adm-page-note">草稿、已下线和已归档内容仅在后台可见。发布前需预览并人工确认；修改已发布内容时，先下线回到草稿。</p>
  </>;
}
