"use client";

import Link from "next/link";
import { cloneElement, isValidElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { ArrowLeft, Check, Copy as CopyIcon, Upload, X } from "lucide-react";
import { api } from "@/lib/api";
import type { StationData, Status } from "@/lib/station-types";

export const labels: Record<string, string> = { android: "安卓手机", ios: "苹果手机", tv: "安卓电视", desktop: "电脑" };
export const statuses: Record<Status, string> = { normal: "正常使用", attention: "需要注意", unavailable: "暂时无法使用" };
export const date = (s?: string | null) => s ? new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(s)) : "尚未发布";
export const errorText = (e: unknown) => e instanceof Error ? e.message : "未能保存，请检查网络后重试。已填写内容仍然保留。";
export function writeBody(value: object) { return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => !["id", "created_at", "expired", "effective_pinned"].includes(key)))); }
export function newSlug(prefix: string) { return `${prefix}-${crypto.randomUUID().slice(0,8)}`; }
export function useStationAdmin() {
  const [data, setData] = useState<StationData | null>(null);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { let active = true; api<StationData>("/admin/station/data").then(d => { if (active) { setData(d); setError(""); } }).catch(e => { if (active) setError(errorText(e)); }); return () => { active = false; }; }, [revision]);
  return { data, error, reload: () => setRevision(x => x + 1) };
}
export function Pending({ error, retry }: { error: string; retry: () => void }) {
  return <div className="sa-empty" role={error ? "alert" : "status"}><h2>{error ? "暂时无法读取内容" : "正在读取内容…"}</h2>{error && <><p>{error}</p><button className="sa-button" onClick={retry}>重新加载</button></>}</div>;
}
export function Heading({ title, description, action, back }: { title: string; description?: string; action?: ReactNode; back?: string }) { return <header className="sa-heading"><div>{back && <Link className="sa-back" href={back}><ArrowLeft size={16}/>返回列表</Link>}<h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</header>; }
export function Flash({ error, success }: { error?: string; success?: string }) { return <>{error && <div className="sa-alert sa-error" role="alert">{error}<small>内容仍然保留，请检查后再次保存。</small></div>}{success && <div className="sa-alert sa-success" role="status"><Check size={18}/>{success}</div>}</>; }
export function Field({ label, hint, children, wide }: { label: string; hint?: string; children: ReactNode; wide?: boolean }) { const id=useId(); return <div className={`sa-field ${wide ? "sa-wide" : ""}`}><label htmlFor={id}>{label}</label>{isValidElement(children)?cloneElement(children as ReactElement<{id:string;"aria-describedby"?:string}>,{id,"aria-describedby":hint?`${id}-hint`:undefined}):children}{hint && <small id={`${id}-hint`}>{hint}</small>}</div>; }
export function Copy({ value, label = "复制分享链接" }: { value: string; label?: string }) {
  const [done, setDone] = useState(false); const [manual, setManual] = useState(false);
  async function copy() { const text = value.startsWith("/") ? window.location.origin + value : value; try { await navigator.clipboard.writeText(text); setDone(true); setManual(false); setTimeout(() => setDone(false), 2500); } catch { setManual(true); } }
  return <div className="sa-copy"><button type="button" className="sa-button sa-secondary" onClick={copy}>{done ? <Check size={16}/> : <CopyIcon size={16}/>}<span aria-live="polite">{done ? "已复制" : label}</span></button>{manual && <label className="sa-manual">浏览器未允许自动复制，请长按或全选下方链接。<input aria-label="手动复制链接" readOnly value={value.startsWith("/") && typeof window !== "undefined" ? window.location.origin + value : value} onFocus={e => e.target.select()}/></label>}</div>;
}
export function ImageUpload({ onUpload, label = "上传图片" }: { onUpload: (url: string) => void; label?: string }) {
  const input = useRef<HTMLInputElement>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  return <div className="sa-uploader"><button type="button" className="sa-button sa-secondary" disabled={busy} onClick={() => input.current?.click()}><Upload size={16}/>{busy ? "正在上传…" : label}</button><input ref={input} type="file" accept="image/png,image/jpeg,image/webp" aria-label={label} className="sa-file-input" onChange={async e => { const file = e.target.files?.[0]; if (!file) return; setBusy(true); setError(""); try { const body = new FormData(); body.append("file", file); const result = await api<{ url: string }>("/admin/station/uploads", { method: "POST", body }); onUpload(result.url); } catch (cause) { setError(errorText(cause)); } finally { setBusy(false); if (input.current) input.current.value = ""; } }}/>{error && <p role="alert" className="sa-error-text">{error}</p>}<small>PNG、JPG 或 WebP，图片会保存在本站。</small></div>;
}
export function Preview({ open, close, children, title }: { open: boolean; close: () => void; children: ReactNode; title: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <dialog className="sa-preview" ref={dialog} onCancel={close} onClose={close}><div className="sa-preview-head"><div><small>仅管理员可见 · 发布前预览</small><h2>{title}</h2></div><button type="button" className="sa-icon-button" aria-label="关闭预览" onClick={close}><X/></button></div><div className="sa-preview-body">{children}</div><button type="button" className="sa-button sa-secondary" onClick={close}>返回编辑</button></dialog>;
}
export function SaveActions({ busy, published, preview }: { busy: boolean; published: boolean; preview: () => void }) { return <div className="sa-save-bar"><span>{published ? "已发布内容修改后立即生效" : "草稿只对管理员可见"}</span><div><button className="sa-button sa-secondary" type="submit" name="intent" value="draft" disabled={busy}>{published ? "撤回为草稿" : "保存草稿"}</button><button className="sa-button sa-secondary" type="button" onClick={preview}>预览</button><button className="sa-button" type="submit" name="intent" value="publish" disabled={busy}>{busy ? "正在保存…" : published ? "保存修改" : "发布"}</button></div></div>; }
