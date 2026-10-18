"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Boxes, FolderOpen, History, LogOut, ArrowUpRight, Megaphone, LayoutDashboard, Layers3, ChevronDown } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminSession } from "@/lib/types";
import { errorMessage, isUnauthorized, Loading, Notice } from "./ui";
import { BrandMark } from '@/components/station/common';

const navigation = [
  { href: "/admin", label: "管理首页", icon: LayoutDashboard },
  { href: "/admin/station/software", label: "软件管理", icon: Boxes },
  { href: "/admin/station/releases", label: "版本与下载", icon: History },
  { href: "/admin/station/announcements", label: "群公告", icon: Megaphone },
  { href: "/admin/station/settings", label: "站点设置", icon: FolderOpen },
  { href: "/admin/station/promotions", label: "广告与推广", icon: Layers3 },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const [session, setSession] = useState<AdminSession | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const login = path === "/admin/login";

  useEffect(() => {
    if (login) return;
    let cancelled = false;
    api<AdminSession>("/admin/auth/me").then(value => { if (!cancelled) { setSession(value); setError(""); } }).catch(cause => {
      if (cancelled) return;
      if (isUnauthorized(cause)) { setSession(null); router.replace("/admin/login"); }
      else setError(errorMessage(cause));
    });
    return () => { cancelled = true; };
  }, [login, retry, router]);

  async function logout() {
    setLeaving(true); setError("");
    try { await api("/admin/auth/logout", { method: "POST" }); setSession(null); router.replace("/admin/login"); }
    catch (cause) { if (isUnauthorized(cause)) { setSession(null); router.replace("/admin/login"); } else setError(errorMessage(cause)); }
    finally { setLeaving(false); }
  }

  if (login) return <div className="admin-root">{children}</div>;
  if (!session) return <div className="admin-root adm-auth-check">{error ? <><Notice>{error}</Notice><button className="adm-button" onClick={() => { setError(""); setRetry(value => value + 1); }}>重新连接</button></> : <Loading text="正在验证管理员身份…" />}</div>;

  return <div className="admin-root adm-shell">
    <aside className="adm-sidebar">
      <Link href="/admin" className="adm-sidebar-heading"><span className="adm-brand-mark"><BrandMark/></span><div><strong>小站管理</strong><span>内容发布工作台</span></div></Link>
      <button type="button" className="adm-mobile-exit" onClick={logout} disabled={leaving} aria-label="退出登录"><LogOut size={18}/></button>
      <nav aria-label="后台导航" className={expanded ? "is-expanded" : ""} id="admin-navigation">{navigation.map((item, index) => { const active = item.href === "/admin" ? path === item.href : path.startsWith(item.href); return <Link key={item.href} href={item.href} onClick={() => setExpanded(false)} className={`adm-nav-item ${index > 2 ? "adm-nav-secondary" : ""} ${active ? "is-active" : ""}`} aria-current={active ? "page" : undefined}><item.icon size={19} /><span>{item.label}</span></Link>; })}</nav>
      <button type="button" className="adm-nav-expand" aria-expanded={expanded} aria-controls="admin-navigation" onClick={() => setExpanded(value => !value)}>{expanded ? "收起管理栏目" : "公告、设置与更多管理"}<ChevronDown size={16} /></button>
      <div className="adm-sidebar-bottom"><Link className="adm-nav-item" href="/" target="_blank" rel="noopener noreferrer"><ArrowUpRight size={18} />查看公开站点</Link><div className="adm-account"><span title={session.user.email}>{session.user.email}</span><button type="button" onClick={logout} disabled={leaving} aria-label="退出登录" title="退出登录"><LogOut size={18} /></button></div></div>
    </aside>
    <div className="adm-main"><div className="adm-workspace-head"><span>内容管理 <ChevronDown size={13}/> {navigation.find(item => item.href === '/admin' ? path === item.href : path.startsWith(item.href))?.label || '编辑内容'}</span><Link href="/" target="_blank" rel="noopener noreferrer">查看网站<ArrowUpRight size={15}/></Link></div>{error && <Notice>{error}</Notice>}{children}</div>
  </div>;
}
