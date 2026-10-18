"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowLeft, ArrowUpRight, CheckCircle2, ClipboardCopy, Eye, Megaphone, Save, Send, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Paginated, ReleaseUpdate, Software } from "@/lib/types";
import { ConfirmDialog, errorMessage, formatDate, isUnauthorized, Loading, Notice } from "./ui";
import { automaticSlug, clearSessionDraft, readSessionDraft, useSessionDraft, useUnsavedNavigation } from "./workflow";

type Draft = Omit<ReleaseUpdate, "id" | "software" | "published_at" | "created_at" | "updated_at" | "changes"> & { changes: string };
const kindNames = { release: "版本更新", notice: "使用提醒", maintenance: "维护通知" };
const statusNames = { draft: "草稿", review: "待审核", published: "已发布", archived: "已归档" };
const levelNames = { critical: "紧急 / 必须处理", recommended: "建议处理", optional: "一般通知", hold: "暂缓操作" };
const empty: Draft = { slug: "", title: "", summary: "", content: "", kind: "notice", software_id: null, version: "", previous_version: "", update_level: "optional", changes: "", reason_to_update: "", who_should_update: "", who_can_wait: "", known_issues: "", notes: "", official_release_url: null, official_release_date: null, status: "draft", is_pinned: false, is_demo: false, is_historical: false };

function toDraft(item: ReleaseUpdate): Draft {
  return { slug: item.slug, title: item.title, summary: item.summary, content: item.content, kind: item.kind, software_id: item.software_id, version: item.version || "", previous_version: item.previous_version || "", update_level: item.update_level, changes: item.changes.join("\n"), reason_to_update: item.reason_to_update, who_should_update: item.who_should_update, who_can_wait: item.who_can_wait, known_issues: item.known_issues, notes: item.notes, official_release_url: item.official_release_url, official_release_date: item.official_release_date, status: item.status, is_pinned: item.is_pinned, is_demo: item.is_demo, is_historical: item.is_historical };
}

async function allSoftware(): Promise<Software[]> {
  const first = await api<Paginated<Software>>("/admin/software?page_size=100");
  const rows = [...first.items];
  for (let page = 2; rows.length < first.total; page += 1) {
    const next = await api<Paginated<Software>>(`/admin/software?page_size=100&page=${page}`);
    if (!next.items.length) break;
    rows.push(...next.items);
  }
  return rows;
}

function UpdatePreview({ draft, softwareName }: { draft: Draft; softwareName?: string }) {
  return <article className="adm-announcement-preview"><div className="adm-update-meta"><span className="adm-update-kind">{kindNames[draft.kind]}</span><span className={`adm-update-level adm-update-level-${draft.update_level}`}>{levelNames[draft.update_level]}</span>{draft.is_demo && <span className="adm-demo-label">演示公告</span>}</div><h2>{draft.title || "尚未填写标题"}</h2><p className="adm-preview-summary">{draft.summary || "尚未填写摘要"}</p><div className="adm-preview-context">{softwareName || "通用公告"}{draft.version ? ` · ${draft.previous_version ? `${draft.previous_version} → ` : ""}${draft.version}` : ""}</div>{draft.is_demo && <div className="adm-preview-demo">这是一条演示公告，其中的版本和建议未经官方核实。</div>}<section><h3>发生了什么</h3><p>{draft.content || "尚未填写正文"}</p></section><div className="adm-preview-action"><section><h3>影响范围</h3><p>{draft.who_should_update || "尚未填写影响范围"}</p></section><section><h3>建议行动</h3><p>{draft.reason_to_update || "尚未填写行动建议"}</p></section></div>{draft.changes.trim() && <section><h3>主要变化</h3><ul>{draft.changes.split("\n").map(item => item.trim()).filter(Boolean).map((item, index) => <li key={index}>{item}</li>)}</ul></section>}{draft.who_can_wait && <section><h3>可以暂缓的用户</h3><p>{draft.who_can_wait}</p></section>}{draft.known_issues && <section><h3>注意事项 / 已知问题</h3><p>{draft.known_issues}</p></section>}{draft.notes && <section><h3>补充说明</h3><p>{draft.notes}</p></section>}{draft.official_release_url && <section><h3>官方来源</h3><p className="adm-preview-source">{draft.official_release_url}</p></section>}</article>;
}

export function UpdateEditor({ updateId, initialSoftwareId, initialMode }: { updateId?: string; initialSoftwareId?: string; initialMode?: "release" | "history" }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(empty);
  const [saved, setSaved] = useState<ReleaseUpdate | null>(null);
  const [software, setSoftware] = useState<Software[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [revision, setRevision] = useState(0);
  const [previewMode, setPreviewMode] = useState<"preview" | "publish" | null>(null);
  const [archiving, setArchiving] = useState(false);
  const [notification, setNotification] = useState("");
  const [notificationFormat, setNotificationFormat] = useState<"plain" | "markdown">("plain");
  const [copying, setCopying] = useState(false);
  const [copyMessage, setCopyMessage] = useState("");
  const [issues, setIssues] = useState<{ name: string; label: string }[]>([]);
  const slugSuffix = useRef("");
  const customSlug = useRef(false);
  const customTitle = useRef(false);
  const draftKey = `updatehub:update-draft:${updateId || `new:${initialSoftwareId || "general"}:${initialMode || "notice"}`}`;
  const unsavedDialog = useUnsavedNavigation(dirty, () => clearSessionDraft(draftKey));
  useSessionDraft(draftKey, draft, dirty, !loading, saved?.updated_at || null);
  const dialog = useRef<HTMLDialogElement>(null);
  const notificationArea = useRef<HTMLTextAreaElement>(null);
  const lockedAssociation = saved?.status === "published" || saved?.status === "archived";
  const associated = software.find(item => item.id === draft.software_id);
  const fixedContext = !!initialSoftwareId && !!initialMode && !!associated;
  const workbench = draft.software_id ? `/admin/software/${draft.software_id}/versions` : "/admin/updates";

  useEffect(() => {
    let current = true;
    Promise.all([allSoftware(), updateId ? api<ReleaseUpdate>(`/admin/updates/${updateId}`) : Promise.resolve(null)]).then(([rows, announcement]) => {
      if (!current) return;
      const selected = rows.find(item => item.id === initialSoftwareId);
      slugSuffix.current = crypto.randomUUID().slice(0, 8); customSlug.current = !!announcement; customTitle.current = !!announcement;
      const initial = announcement ? toDraft(announcement) : { ...empty, slug: automaticSlug("announcement", "", slugSuffix.current), kind: initialMode ? "release" as const : "notice" as const, software_id: selected?.id || null, is_demo: selected?.is_demo || false, is_historical: initialMode === "history", previous_version: initialMode === "release" ? selected?.latest_version || "" : "" };
      const recoveredDraft = readSessionDraft(draftKey, initial, announcement?.updated_at || null);
      setSoftware(rows); setSaved(announcement); setDraft(recoveredDraft || initial); setDirty(!!recoveredDraft); setRecovered(!!recoveredDraft); setError(""); setIssues([]);
      if (recoveredDraft) { customSlug.current = true; customTitle.current = true; }
      const query = new URLSearchParams(window.location.search);
      if (query.has("saved")) setSuccess("草稿已保存，可以继续编辑或预览发布。");
      if (query.has("preview") && announcement && !recoveredDraft) setPreviewMode("publish");
    }).catch(cause => { if (!current) return; if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [updateId, initialSoftwareId, initialMode, revision, router, draftKey]);

  useEffect(() => {
    if (previewMode && !dialog.current?.open) dialog.current?.showModal();
    if (!previewMode && dialog.current?.open) dialog.current?.close();
  }, [previewMode]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (key === "slug") customSlug.current = true;
    if (key === "title") customTitle.current = true;
    setDraft(current => {
      const next = { ...current, [key]: value };
      const selected = key === "software_id" ? software.find(item => item.id === value) : associated;
      if (key === "software_id") { next.is_demo = selected?.is_demo || false; next.previous_version = current.is_historical ? "" : selected?.latest_version || ""; }
      if (key === "kind" && value !== "release") next.is_historical = false;
      if (key === "is_historical") next.previous_version = value ? "" : selected?.latest_version || "";
      if (["version", "software_id", "is_historical"].includes(key) && !customTitle.current && selected && next.version) next.title = `${selected.name} ${next.version}${next.is_historical ? " 历史版本记录" : " 版本更新"}`;
      if (!customSlug.current && ["version", "title", "software_id", "is_historical"].includes(key)) next.slug = automaticSlug("announcement", next.title, slugSuffix.current);
      return next;
    });
    setIssues(current => current.filter(issue => issue.name !== key)); setDirty(true); setSuccess(""); setNotification(""); setCopyMessage("");
  }
  function applySaved(value: ReleaseUpdate) { clearSessionDraft(draftKey); setRecovered(false); setSaved(value); setDraft(toDraft(value)); if (value.software) setSoftware(rows => rows.map(item => item.id === value.software_id ? value.software! : item)); setDirty(false); setIssues([]); setNotification(""); setCopyMessage(""); }
  function fail(cause: unknown) { if (isUnauthorized(cause)) router.replace("/admin/login"); else { setError(errorMessage(cause)); window.scrollTo({ top: 0, behavior: "smooth" }); } }

  function locate(name: string) { const element = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`); const details = element?.closest("details"); if (details) details.open = true; element?.scrollIntoView({ block: "center", behavior: "smooth" }); element?.focus({ preventScroll: true }); }
  function validate(publishing: boolean) {
    const missing: { name: string; label: string }[] = [];
    if (!draft.title.trim()) missing.push({ name: "title", label: "公告标题" });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) missing.push({ name: "slug", label: "有效的网址标识" });
    if (publishing) {
      for (const [name, label] of [["summary", "摘要"], ["content", "公告正文"], ["who_should_update", "影响范围"], ["reason_to_update", "行动建议"]] as const) if (!draft[name].trim()) missing.push({ name, label });
      if (draft.kind === "release") {
        if (!draft.version.trim()) missing.push({ name: "version", label: "本次公告版本" });
        if (!associated?.published) missing.push({ name: "software_id", label: "已公开的关联软件" });
        if (!draft.official_release_url && !associated?.official_links.some(link => link.is_active)) missing.push({ name: "official_release_url", label: "官方来源" });
        if (draft.is_historical && !draft.official_release_date) missing.push({ name: "official_release_date", label: "历史版本的真实官方发布日期" });
      }
    }
    if (draft.official_release_url && !/^https:\/\//.test(draft.official_release_url)) missing.push({ name: "official_release_url", label: "以 https:// 开头的官方来源" });
    setIssues(missing);
    if (missing.length) { setError("还有内容需要补充或检查。点击下方项目可直接定位。"); requestAnimationFrame(() => locate(missing[0].name)); return false; }
    return true;
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const preview = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "preview";
    if (!validate(preview || saved?.status === "published")) return;
    setBusy(true); setError(""); setSuccess("");
    const { status, ...fields } = draft;
    const payload = { ...fields, title: draft.title.trim(), slug: draft.slug.trim(), changes: draft.changes.split("\n").map(item => item.trim()).filter(Boolean), official_release_url: draft.official_release_url?.trim() || null, official_release_date: draft.official_release_date || null, ...(!saved || saved.status === "draft" || saved.status === "review" ? { status } : {}) };
    try { const value = await api<ReleaseUpdate>(updateId ? `/admin/updates/${updateId}` : "/admin/updates", { method: updateId ? "PATCH" : "POST", body: JSON.stringify(payload) }); applySaved(value); setSuccess(value.status === "published" ? "公告修改已保存，公开内容和群通知已同步更新。" : "草稿已保存，可以继续编辑或预览发布。"); if (!updateId) router.replace(`/admin/updates/${value.id}?${preview ? "preview" : "saved"}=1`); else if (preview) setPreviewMode("publish"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (cause) { fail(cause); }
    finally { setBusy(false); }
  }

  async function publish() {
    if (!saved || dirty) return;
    setBusy(true); setError(""); setSuccess("");
    try { const value = await api<ReleaseUpdate>(`/admin/updates/${saved.id}/publish`, { method: "POST", body: JSON.stringify({ confirmed: true }) }); applySaved(value); setPreviewMode(null); setSuccess(value.is_historical ? "历史版本已补录，仅加入版本历史；当前版本和建议保持不变。" : "公告已发布。公开公告、版本记录和群通知已同步。"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (cause) { setPreviewMode(null); fail(cause); }
    finally { setBusy(false); }
  }

  async function archive() {
    if (!saved) return;
    setBusy(true); setError(""); setSuccess("");
    try { const value = await api<ReleaseUpdate>(`/admin/updates/${saved.id}/archive`, { method: "POST", body: JSON.stringify({}) }); applySaved(value); setSuccess("公告已归档，公开站点已停止展示。历史内容和操作记录会保留。"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (cause) { fail(cause); }
    finally { setBusy(false); setArchiving(false); }
  }

  async function copyNotification() {
    if (!saved) return;
    setCopying(true); setCopyMessage(""); setError("");
    try {
      const result = await api<{ text: string }>(`/admin/updates/${saved.id}/notification?format=${notificationFormat}`);
      setNotification(result.text);
      try { await navigator.clipboard.writeText(result.text); setCopyMessage("群通知已复制，可以粘贴到群聊中。"); }
      catch { setCopyMessage("浏览器未允许直接复制。请在下方选择全文后手动复制。"); }
    } catch (cause) { fail(cause); }
    finally { setCopying(false); }
  }

  if (loading) return <Loading text="正在准备公告内容…" />;
  if (error && updateId && !saved) return <><Link className="adm-back" href="/admin/updates"><ArrowLeft size={16} />返回公告管理</Link><Notice>{error}</Notice><button className="adm-button adm-button-secondary" onClick={() => { setError(""); setLoading(true); setRevision(value => value + 1); }}>重新加载</button></>;

  return <>
    <Link className="adm-back" href={workbench}><ArrowLeft size={16} />{draft.software_id ? "返回版本管理" : "返回公告管理"}</Link>
    <header className="adm-page-heading"><div><h1>{draft.kind === "release" ? draft.is_historical ? "补录历史版本" : updateId ? "编辑版本公告" : "发布新版本" : updateId ? "编辑公告" : "新建公告"}</h1><p>{associated ? `${associated.name} · 档案当前版本：${associated.latest_version || "尚未发布"}` : "选择公告类型，说明变化与需要采取的行动。"}</p></div><button type="button" className="adm-button adm-button-secondary" onClick={() => setPreviewMode("preview")}><Eye size={17} />预览内容</button></header>
    {draft.is_historical && <div className="adm-workflow-banner"><HistoryIcon /><div><strong>补录历史版本，不改变当前版本</strong><p>补录仅加入版本历史，不进入最新公告和关注动态，不改变当前版本和建议。</p></div></div>}
    {recovered && <div className="adm-workflow-banner" role="status"><div><strong>已恢复尚未保存的内容</strong><p>这些内容来自当前标签页的临时草稿，还没有提交。请检查后保存。</p></div></div>}
    {error && <Notice>{error}</Notice>}
    {issues.length > 0 && <div className="adm-field-issues" role="alert"><strong>请检查以下内容</strong>{issues.map(issue => <button type="button" key={issue.name} onClick={() => locate(issue.name)}>{issue.label}<ArrowUpRight size={13} /></button>)}</div>}
    {success && <div className="adm-workflow-success"><Notice success>{success}</Notice>{saved?.status === "published" && <div className="adm-actions"><Link href={`/update/${saved.slug}`} target="_blank" rel="noopener noreferrer" className="adm-button adm-button-secondary">查看公告<ArrowUpRight size={15} /></Link><Link href={workbench} className="adm-button adm-button-secondary">返回版本管理</Link><button type="button" className="adm-button adm-button-secondary" onClick={copyNotification} disabled={copying}><ClipboardCopy size={15} />复制群通知</button></div>}</div>}
    <form onSubmit={save} noValidate className="adm-editor adm-update-editor adm-task-editor">
      <div className="adm-editor-main">
        <section className="adm-panel adm-form-section"><div className="adm-section-heading"><h2>{draft.kind === "release" ? "版本信息" : "公告类型与关联"}</h2>{associated?.is_demo && <span className="adm-demo-label">演示软件</span>}</div>
          <div className="adm-form-grid">
            {fixedContext && <div className="adm-version-context adm-full"><strong>{associated.name}</strong><span>{draft.is_historical ? "历史版本记录" : "版本更新"} · 已关联这款软件</span></div>}
            <label className="adm-field" style={fixedContext ? { display: "none" } : undefined}>公告类型<select name="kind" disabled={lockedAssociation || !!initialMode} value={draft.kind} onChange={event => update("kind", event.target.value as Draft["kind"])}>{Object.entries(kindNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            <label className="adm-field" style={fixedContext ? { display: "none" } : undefined}>关联软件<select name="software_id" disabled={lockedAssociation || !!initialSoftwareId} value={draft.software_id || ""} aria-invalid={issues.some(item => item.name === "software_id")} onChange={event => update("software_id", event.target.value || null)}><option value="">通用公告，不关联软件</option>{software.map(item => <option key={item.id} value={item.id}>{item.name}{item.published ? "" : "（未公开）"}</option>)}</select></label>
            {associated && !associated.published && <div className="adm-full"><Notice>关联软件尚未公开。请先<Link className="adm-text-link" href={`/admin/software/${associated.id}`} target="_blank" rel="noopener noreferrer">编辑并公开软件资料</Link>，再保存发布版本。</Notice><button type="button" className="adm-text-link" onClick={async () => { try { const item = await api<Software>(`/admin/software/${associated.id}`); setSoftware(rows => rows.map(row => row.id === item.id ? item : row)); } catch (cause) { fail(cause); } }}>已公开，重新检查</button></div>}
            {draft.kind === "release" && <>
              <label className="adm-field">本次公告版本 <span className="adm-required">*</span><input name="version" maxLength={80} value={draft.version} aria-invalid={issues.some(item => item.name === "version")} onChange={event => update("version", event.target.value)} placeholder="例如：2.4.0" /></label>
              <label className="adm-field">官方发布日期{draft.is_historical && <span className="adm-required"> *</span>}<input name="official_release_date" type="date" disabled={!!saved?.published_at} value={draft.official_release_date || ""} aria-required={draft.is_historical} aria-invalid={issues.some(item => item.name === "official_release_date")} onChange={event => update("official_release_date", event.target.value || null)} /><small>{draft.is_historical ? "历史补录发布前必须填写真实发布日期；补录不会影响当前版本。" : "填写官方发布的日期。留空时按首次站内发布时间排序。"}{saved?.published_at ? " 首次发布后日期不可修改。" : ""}</small></label>
              <label className="adm-field adm-full">上一版本<input name="previous_version" maxLength={80} value={draft.previous_version} onChange={event => update("previous_version", event.target.value)} placeholder="可选，填写实际上一版本" /><small>{draft.is_historical ? "请按历史事实填写，不会自动使用当前版本。" : "已根据软件当前记录预填，可以修正。"}</small></label>
              <label className="adm-checkbox adm-full"><input name="is_historical" type="checkbox" disabled={!!saved?.published_at} checked={draft.is_historical} onChange={event => update("is_historical", event.target.checked)} />这是历史补录，不更新档案当前版本</label>
            </>}
            <label className="adm-field adm-full">官方来源网址<input name="official_release_url" type="url" maxLength={2048} value={draft.official_release_url || ""} aria-invalid={issues.some(item => item.name === "official_release_url")} onChange={event => update("official_release_url", event.target.value || null)} placeholder="https://…" /><small>{associated?.official_links.some(link => link.is_active) ? "可留空，届时使用这款软件已保存的官方入口；有独立发布说明时建议填写。" : "请填写可核对的官方来源地址。"}</small></label>
          </div>
        </section>
        <section className="adm-panel adm-form-section"><div className="adm-section-heading"><h2>更新说明</h2><span className="adm-muted">发布前需要完整填写</span></div><div className="adm-form-grid">
          <label className="adm-field adm-full">公告标题 <span className="adm-required">*</span><input name="title" maxLength={200} value={draft.title} aria-invalid={issues.some(item => item.name === "title")} onChange={event => update("title", event.target.value)} placeholder="填写版本号后会自动生成标题，也可以自行修改" /></label>
          {([['summary','摘要','用两三句话概括本次变化'],['content','公告正文','说明具体变化、处理步骤和需要了解的背景'],['who_should_update','影响范围','例如：使用 Windows 旧版客户端的用户'],['reason_to_update','行动建议','用户需要做什么，为什么，以及什么时候完成']] as const).map(([name,label,placeholder]) => <label className="adm-field adm-full" key={name}>{label} <span className="adm-required">*</span><textarea name={name} rows={name === "content" ? 5 : 2} maxLength={name === "content" ? 30000 : name === "summary" ? 1000 : 5000} value={draft[name]} aria-invalid={issues.some(item => item.name === name)} onChange={event => update(name,event.target.value)} placeholder={placeholder} /></label>)}
          <label className="adm-field adm-full">主要变化<textarea name="changes" rows={3} value={draft.changes} onChange={event => update("changes", event.target.value)} placeholder={"可选，每行一条变化\n例如：修复连接中断问题"} /></label>
        </div></section>
        <details className="adm-panel adm-workflow-details"><summary>更多说明与高级设置 <span>可选填写</span></summary><div className="adm-form-grid">
          {([['who_can_wait','可以暂缓的用户'],['known_issues','注意事项 / 已知问题'],['notes','补充说明']] as const).map(([name,label]) => <label className="adm-field adm-full" key={name}>{label}<textarea name={name} rows={2} maxLength={5000} value={draft[name]} onChange={event => update(name,event.target.value)} /></label>)}
          <label className="adm-field adm-full">网址标识<input name="slug" maxLength={160} value={draft.slug} onChange={event => update("slug",event.target.value)} /><small>已自动生成，无需手动填写。发布后建议保持不变。</small></label>
        </div></details>
      </div>
      <aside className="adm-editor-aside adm-update-aside"><section className="adm-panel adm-publish-panel"><h2><Megaphone size={18} />发布设置</h2><div className="adm-publish-status"><span className={`adm-status adm-status-${draft.status === "published" ? "published" : draft.status === "review" ? "review" : "draft"}`}><span />{statusNames[draft.status]}</span>{dirty && <small>尚未保存</small>}</div>
        <label className="adm-field">重要程度 / 处理建议<select name="update_level" value={draft.update_level} onChange={event => update("update_level",event.target.value as Draft["update_level"])}>{Object.entries(levelNames).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        {(!saved || saved.status === "draft" || saved.status === "review") && <label className="adm-field adm-update-status-field">草稿状态<select name="status" value={draft.status} onChange={event => update("status",event.target.value as "draft" | "review")}><option value="draft">草稿</option><option value="review">待审核</option></select></label>}
        <label className="adm-checkbox adm-update-option"><input type="checkbox" checked={draft.is_pinned} onChange={event => update("is_pinned",event.target.checked)} />在公告中心置顶</label>
        <label className="adm-checkbox adm-update-option"><input name="is_demo" type="checkbox" disabled={!!saved?.published_at} checked={draft.is_demo} onChange={event => update("is_demo",event.target.checked)} />标记为演示公告</label>
        {saved?.published_at && <p className="adm-page-note">首次发布后不能更改演示属性，请新建公告。</p>}
        {saved?.status === "published" && <p className="adm-page-note">保存修改会同步公开内容；新增另一个版本请返回版本管理。</p>}
        {saved?.published_at && <p className="adm-page-note">首次发布：{formatDate(saved.published_at)}</p>}
        {saved && saved.status !== "archived" && <button type="button" className="adm-text-link adm-danger-text adm-archive-action" disabled={busy || dirty} onClick={() => setArchiving(true)}><Archive size={14} />归档这条公告</button>}
        {saved?.status === "archived" && <p className="adm-page-note">已从公开站点移除。可以编辑内容后预览，重新确认发布。</p>}
      </section>
      {saved?.status === "published" && <section className="adm-panel adm-notification-panel" id="notification-panel"><h2>复制群通知</h2><p className="adm-page-note">根据已发布内容生成，包含公告地址和行动建议。</p><label className="adm-field">复制格式<select value={notificationFormat} onChange={event => { setNotificationFormat(event.target.value as "plain" | "markdown"); setNotification(""); setCopyMessage(""); }}><option value="plain">纯文本</option><option value="markdown">Markdown</option></select></label><button type="button" className="adm-button adm-button-secondary adm-button-block" disabled={copying || dirty || busy} onClick={copyNotification}><ClipboardCopy size={16} />{copying ? "正在生成…" : "生成并复制"}</button>{copyMessage && <p className="adm-copy-message" role="status">{copyMessage}</p>}{notification && <><label className="adm-field">通知内容<textarea ref={notificationArea} value={notification} readOnly rows={9} /></label><button type="button" className="adm-text-link" onClick={() => { notificationArea.current?.focus(); notificationArea.current?.select(); }}>选择全文</button></>}</section>}
      </aside>
      <div className="adm-workflow-actions"><span>{busy ? "正在保存…" : dirty ? "有未保存的修改" : saved ? "已保存" : "填写后保存"}</span><div className="adm-actions"><button type="submit" name="action" value="draft" disabled={busy} className={`adm-button ${saved?.status === "published" ? "" : "adm-button-secondary"}`}><Save size={16} />{saved?.status === "published" ? "保存并更新公告" : saved?.status === "archived" ? "保存归档内容" : draft.status === "review" ? "保存为待审核" : "保存草稿"}</button>{saved?.status !== "published" && <button type="submit" name="action" value="preview" disabled={busy} className="adm-button"><Send size={16} />{saved?.status === "archived" ? "预览重新发布" : "保存并预览"}</button>}</div></div>
    </form>
    <dialog className="adm-preview-dialog" ref={dialog} aria-labelledby="adm-preview-dialog-title" onCancel={event => { event.preventDefault(); if (!busy) setPreviewMode(null); }}><div className="adm-preview-dialog-header"><div><h2 id="adm-preview-dialog-title">{previewMode === "publish" ? "确认发布这条公告？" : "公告内容预览"}</h2><p>{previewMode === "publish" ? draft.is_historical ? "历史补录：只增加历史记录，不改变软件当前版本。请核对版本号和官方发布日期。" : "内容已保存。确认后将在公开站点展示。" : dirty ? "当前预览包含尚未保存的修改。" : "以下内容为当前已保存的公告。"}</p></div><button className="adm-icon-button" type="button" disabled={busy} aria-label="关闭预览" onClick={() => setPreviewMode(null)}><X size={20} /></button></div><div className="adm-preview-dialog-content">{draft.kind === "release" && <div className="adm-preview-version-facts"><span>本次版本<strong>{draft.version || "待填写"}</strong></span><span>官方发布日期<strong>{draft.official_release_date || "未填写，使用站内首次发布日期"}</strong></span><span>档案当前版本<strong>{associated?.latest_version || "尚未发布"}</strong></span><p>{draft.is_historical ? "本次为历史补录，当前版本保持不变。" : "系统按发布日期判断是否更新当前版本。"}</p></div>}<UpdatePreview draft={draft} softwareName={associated?.name} /></div><div className="adm-preview-dialog-actions"><button className="adm-button adm-button-secondary" disabled={busy} type="button" onClick={() => setPreviewMode(null)}>{previewMode === "publish" ? "返回检查" : "继续编辑"}</button>{previewMode === "publish" && <button className="adm-button" disabled={busy} type="button" onClick={publish}><CheckCircle2 size={17} />{busy ? "正在发布…" : "确认发布公告"}</button>}</div></dialog>
    <ConfirmDialog open={archiving} title="归档这条公告？" busy={busy} onClose={() => setArchiving(false)} onConfirm={archive} action="确认归档"><p>归档后，这条公告会从公开站点移除。历史内容和操作记录保留，软件已确认的版本不会回退；之后可预览并重新发布。</p></ConfirmDialog>
    {unsavedDialog}
  </>;
}

function HistoryIcon() { return <Archive size={23} aria-hidden="true" />; }
