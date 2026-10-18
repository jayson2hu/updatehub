"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { AlertCircle, CheckCircle2, LoaderCircle } from "lucide-react";

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "操作未完成，请重试。";
}

export function isUnauthorized(error: unknown): boolean {
  return !!error && typeof error === "object" && "status" in error && error.status === 401;
}

export function Notice({ children, success = false }: { children: ReactNode; success?: boolean }) {
  return <div className={`adm-notice ${success ? "adm-notice-success" : "adm-notice-error"}`} role={success ? "status" : "alert"}>
    {success ? <CheckCircle2 size={18} /> : <AlertCircle size={18} />}<span>{children}</span>
  </div>;
}

export function Loading({ text = "正在读取…" }: { text?: string }) {
  return <div className="adm-loading" role="status"><LoaderCircle size={20} className="adm-spin" />{text}</div>;
}

export function ConfirmDialog({ open, title, children, busy, onConfirm, onClose, action = "确认下线" }: {
  open: boolean; title: string; children: ReactNode; busy: boolean; onConfirm: () => void; onClose: () => void; action?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (open && !ref.current?.open) ref.current?.showModal();
    else if (!open && ref.current?.open) ref.current?.close();
  }, [open]);
  return <dialog className="adm-dialog" ref={ref} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} aria-labelledby={titleId}>
    <h2 id={titleId}>{title}</h2><div className="adm-dialog-body">{children}</div>
    <div className="adm-actions"><button className="adm-button adm-button-secondary" type="button" onClick={onClose} disabled={busy} autoFocus>取消</button><button className="adm-button adm-button-danger" type="button" onClick={onConfirm} disabled={busy}>{busy ? "正在处理…" : action}</button></div>
  </dialog>;
}

export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange: (page: number) => void }) {
  const last = Math.max(1, Math.ceil(total / pageSize));
  return <div className="adm-pagination"><span>共 {total} 条 · 第 {page} / {last} 页</span><div className="adm-actions"><button type="button" className="adm-button adm-button-secondary adm-button-small" disabled={page <= 1} onClick={() => onChange(page - 1)}>上一页</button><button type="button" className="adm-button adm-button-secondary adm-button-small" disabled={page >= last} onClick={() => onChange(page + 1)}>下一页</button></div></div>;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function SoftwareIcon({ url, name }: { url?: string | null; name: string }) {
  return <span className="adm-software-icon">{url ? <img src={url} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /> : name.slice(0, 1).toUpperCase()}</span>;
}
