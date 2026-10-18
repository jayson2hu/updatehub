"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowLeft, ShieldCheck, Eye, EyeOff, LockKeyhole } from "lucide-react";
import { api } from "@/lib/api";
import type { AdminSession } from "@/lib/types";
import { Notice, errorMessage } from "@/components/admin/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try { await api<AdminSession>("/admin/auth/login", { method: "POST", body: JSON.stringify({ email: email.trim(), password }) }); router.replace("/admin"); router.refresh(); }
    catch (cause) { setError(errorMessage(cause)); }
    finally { setBusy(false); }
  }

  return <div className="adm-login-wrap">
    <div className="adm-login-intro"><span className="adm-login-mark"><ShieldCheck size={32} /></span><h1>每次更新，<br />都有人看得见。</h1><p>在这里维护软件版本、安装方法和群公告。<br />发布后，复制链接就能分享给群友。</p><Link href="/" className="adm-text-link"><ArrowLeft size={16} />返回更新小站</Link></div>
    <section className="adm-login-card" aria-labelledby="adm-login-title"><div className="adm-login-title"><LockKeyhole size={23} /><h2 id="adm-login-title">管理员登录</h2></div><p className="adm-muted">使用管理员邮箱和密码继续。</p>
      <form onSubmit={login} className="adm-form">{error && <Notice>{error}</Notice>}<label className="adm-field">邮箱<input type="email" name="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="admin@example.com" autoFocus /></label><label className="adm-field">密码<div className="adm-password"><input type={visible ? "text" : "password"} name="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /><button type="button" aria-label={visible ? "隐藏密码" : "显示密码"} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label><button type="submit" className="adm-button adm-button-block" disabled={busy}>{busy ? "正在登录…" : "登录管理后台"}</button></form>
      <p className="adm-login-footnote">此入口仅供内容管理员使用。普通访客无需登录。</p>
    </section>
  </div>;
}
