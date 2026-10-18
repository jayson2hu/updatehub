"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { FolderOpen, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Category } from "@/lib/types";
import { ConfirmDialog, errorMessage, isUnauthorized, Loading, Notice } from "@/components/admin/ui";

const blank = { name: "", slug: "", sort_order: 0 };

export default function CategoriesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let current = true;
    api<Category[]>("/categories").then(data => { if (current) setItems(data); }).catch(cause => { if (current) setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [revision]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setSuccess("");
    try { await api(editing ? `/admin/categories/${editing}` : "/admin/categories", { method: editing ? "PATCH" : "POST", body: JSON.stringify({ ...form, name: form.name.trim(), slug: form.slug.trim() }) }); setSuccess(`分类“${form.name.trim()}”已${editing ? "保存" : "添加"}。`); setEditing(null); setForm(blank); setLoading(true); setRevision(value => value + 1); }
    catch (cause) { if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!deleting) return;
    setBusy(true); setError(""); setSuccess("");
    try { await api(`/admin/categories/${deleting.id}`, { method: "DELETE" }); setSuccess(`分类“${deleting.name}”已删除。`); if (editing === deleting.id) { setEditing(null); setForm(blank); } setLoading(true); setRevision(value => value + 1); }
    catch (cause) { if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }
    finally { setBusy(false); setDeleting(null); }
  }

  return <>
    <header className="adm-page-heading"><div><h1>分类管理</h1><p>清晰的分类，帮助用户缩小寻找范围。</p></div><span className="adm-count">{items.length} 个分类</span></header>
    {error && <Notice>{error}</Notice>}{success && <Notice success>{success}</Notice>}
    <div className="adm-category-layout"><section className="adm-panel">{loading ? <Loading /> : items.length ? <div className="adm-table-scroll"><table className="adm-table"><thead><tr><th>分类名称</th><th>网址标识</th><th>排序</th><th>操作</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td><strong>{item.name}</strong></td><td>{item.slug}</td><td>{item.sort_order}</td><td><div className="adm-row-actions"><button className="adm-icon-button" aria-label={`编辑分类 ${item.name}`} onClick={() => { setEditing(item.id); setForm({ name: item.name, slug: item.slug, sort_order: item.sort_order }); setError(""); setSuccess(""); }}><Pencil size={16} /></button><button className="adm-icon-button adm-danger-text" aria-label={`删除分类 ${item.name}`} onClick={() => setDeleting(item)}><Trash2 size={16} /></button></div></td></tr>)}</tbody></table></div> : <div className="adm-empty"><FolderOpen size={32} /><h2>还没有分类</h2><p>添加第一个分类，例如“开发工具”或“办公效率”。</p></div>}</section>
      <section className="adm-panel adm-category-form"><div className="adm-section-heading"><h2>{editing ? "编辑分类" : "添加分类"}</h2>{editing && <button className="adm-icon-button" aria-label="取消编辑分类" onClick={() => { setEditing(null); setForm(blank); }}><X size={18} /></button>}</div><form onSubmit={submit} className="adm-form"><label className="adm-field">分类名称 <span className="adm-required">*</span><input name="name" required maxLength={80} value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} placeholder="例如：开发工具" /></label><label className="adm-field">网址标识 <span className="adm-required">*</span><input name="slug" required maxLength={100} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" title="使用小写英文字母、数字和中划线" value={form.slug} onChange={event => setForm(value => ({ ...value, slug: event.target.value }))} placeholder="例如：development" /><small>使用小写英文字母、数字和中划线。</small></label><label className="adm-field">显示顺序<input name="sort_order" type="number" min={-10000} max={10000} step={1} value={form.sort_order} onChange={event => setForm(value => ({ ...value, sort_order: Number(event.target.value) }))} /><small>数字越小，排序越靠前。</small></label><button type="submit" disabled={busy} className="adm-button">{!editing && <Plus size={17} />}{busy ? "正在保存…" : editing ? "保存分类" : "添加分类"}</button>{editing && <button type="button" className="adm-button adm-button-secondary" onClick={() => { setEditing(null); setForm(blank); }}>取消编辑</button>}</form><p className="adm-page-note">已被软件使用的分类不可删除，请先为这些软件选择其他分类。</p></section>
    </div>
    <ConfirmDialog open={!!deleting} title={`删除分类“${deleting?.name || ""}”？`} busy={busy} onClose={() => setDeleting(null)} onConfirm={remove} action="确认删除"><p>此操作会删除这个分类。已被软件使用的分类会保留，并提示先调整软件分类。</p></ConfirmDialog>
  </>;
}
