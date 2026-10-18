"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ChevronDown, History, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import type { AuditEntry, Paginated } from "@/lib/types";
import { errorMessage, formatDate, isUnauthorized, Loading, Notice, Pagination } from "@/components/admin/ui";

const actions: Record<string, string> = { create: "创建", update: "修改", publish: "发布", archive: "归档", sync_version: "同步当前版本", delete: "删除 / 下线", login: "登录", logout: "退出登录", upload: "上传图标", "software.create": "添加软件", "software.update": "修改软件", "software.delete": "下线软件", "category.create": "添加分类", "category.update": "修改分类", "category.delete": "删除分类" };
const resources: Record<string, string> = { release_update: "公告", software: "软件", category: "分类", admin: "管理员", admin_user: "管理员", icon: "图标", auth: "登录会话" };

export default function AuditPage() {
  const router = useRouter();
  const [data, setData] = useState<Paginated<AuditEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;

    api<Paginated<AuditEntry>>(`/admin/audit?page=${page}&page_size=20`).then(result => { if (current) setData(result); }).catch(cause => { if (!current) return; if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [page, revision, router]);

  return <><header className="adm-page-heading"><div><h1>操作日志</h1><p>追溯公告发布、软件资料与官方链接的每一次变更。</p></div><button type="button" className="adm-button adm-button-secondary" disabled={loading} onClick={() => { setLoading(true); setError(""); setRevision(value => value + 1); }}><RefreshCw size={17} />刷新日志</button></header>{error && <Notice>{error}</Notice>}
    <section className="adm-panel">{loading ? <Loading text="正在读取操作日志…" /> : data?.items.length ? <><div className="adm-audit-list">{data.items.map(entry => <details className="adm-audit-entry" key={entry.id}><summary><span className="adm-audit-symbol"><History size={18} /></span><span className="adm-audit-title"><strong>{actions[entry.action] || entry.action}<span>{resources[entry.resource_type] || entry.resource_type}</span></strong><small>对象：{entry.resource_id || "—"}</small></span><time>{formatDate(entry.created_at)}</time><ChevronDown size={18} className="adm-details-arrow" /></summary><div className="adm-audit-detail"><p>操作管理员：<code>{entry.admin_user_id || "系统"}</code></p><p className="adm-muted">展开记录保留本次操作的原始变更内容；before 为修改前，after 为修改后。</p><pre>{JSON.stringify(entry.payload, null, 2)}</pre></div></details>)}</div><Pagination page={page} total={data.total} pageSize={20} onChange={value => { setLoading(true); setError(""); setPage(value); }} /></> : <div className="adm-empty"><History size={34} /><h2>{error ? "日志暂时无法读取" : "还没有操作记录"}</h2><p>{error ? "请尝试刷新日志。" : "维护软件或分类后，操作记录会显示在这里。"}</p></div>}</section>
  </>;
}
