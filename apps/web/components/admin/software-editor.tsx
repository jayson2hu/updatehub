"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowUpRight, Check, Globe, ImagePlus, Link2, Plus, Save, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import type { Category, OfficialLink, Software } from "@/lib/types";
import { errorMessage, isUnauthorized, Loading, Notice, SoftwareIcon } from "./ui";
import { automaticSlug, clearSessionDraft, readSessionDraft, useSessionDraft, useUnsavedNavigation } from "./workflow";

type EditableLink = OfficialLink & { key: string };
type Draft = {
  name: string; slug: string; short_name: string; summary: string; description: string; icon_url: string;
  category_id: string; website_url: string; docs_url: string; github_url: string; latest_version: string;
  update_level: Software["update_level"]; update_reason: string; published: boolean; is_demo: boolean;
  aliases: string; tags: string; purposes: string; platforms: string[]; official_links: EditableLink[];
  seo_title: string; seo_description: string;
};

const empty: Draft = { name: "", slug: "", short_name: "", summary: "", description: "", icon_url: "", category_id: "", website_url: "", docs_url: "", github_url: "", latest_version: "", update_level: "optional", update_reason: "", published: true, is_demo: false, aliases: "", tags: "", purposes: "", platforms: [], official_links: [], seo_title: "", seo_description: "" };
const platformOptions = [{ value: "windows", label: "Windows" }, { value: "macos", label: "macOS" }, { value: "linux", label: "Linux" }, { value: "android", label: "Android" }, { value: "ios", label: "iOS" }, { value: "web", label: "Web" }];
const linkTypes: { value: OfficialLink["type"]; label: string }[] = [{ value: "website", label: "官方网站" }, { value: "download", label: "官方下载页" }, { value: "release", label: "版本发布页" }, { value: "docs", label: "官方文档" }, { value: "store", label: "应用商店" }];

function splitValues(value: string): string[] { return [...new Set(value.split(/[,，\n]/).map(item => item.trim()).filter(Boolean))]; }
function editable(value: Software): Draft {
  return { name: value.name, slug: value.slug, short_name: value.short_name || "", summary: value.summary || "", description: value.description || "", icon_url: value.icon_url || "", category_id: value.category_id || "", website_url: value.website_url || "", docs_url: value.docs_url || "", github_url: value.github_url || "", latest_version: value.latest_version || "", update_level: value.update_level || "optional", update_reason: value.update_reason || "", published: value.published, is_demo: value.is_demo, aliases: value.aliases.join("，"), tags: value.tags.join("，"), purposes: value.purposes.join("，"), platforms: value.platforms, official_links: value.official_links.map((item, index) => ({ ...item, key: item.id || `existing-${index}` })), seo_title: value.seo_title || "", seo_description: value.seo_description || "" };
}

export function SoftwareEditor({ softwareId }: { softwareId?: string }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(empty);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saved, setSaved] = useState<Software | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [dirty, setDirty] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [revision, setRevision] = useState(0);
  const slugSuffix = useRef("");
  const customSlug = useRef(false);
  const draftKey = `updatehub:software-draft:${softwareId || "new"}`;
  const unsavedDialog = useUnsavedNavigation(dirty, () => clearSessionDraft(draftKey));
  useSessionDraft(draftKey, draft, dirty, !loading, saved?.updated_at || null);

  useEffect(() => {
    let current = true;
    Promise.all([api<Category[]>("/categories"), softwareId ? api<Software>(`/admin/software/${softwareId}`) : Promise.resolve(null)]).then(([categoryData, software]) => {
      if (!current) return;
      setCategories(categoryData); setError("");
      slugSuffix.current = crypto.randomUUID().slice(0, 8); customSlug.current = !!software;
      const initial = software ? editable(software) : { ...empty, slug: automaticSlug("software", "", slugSuffix.current), platforms: [], official_links: [] };
      const recoveredDraft = readSessionDraft(draftKey, initial, software?.updated_at || null);
      setDraft(recoveredDraft || initial); setSaved(software); setRecovered(!!recoveredDraft); setDirty(!!recoveredDraft);
      if (recoveredDraft) customSlug.current = true;
      if (new URLSearchParams(window.location.search).has("saved")) setSuccess("软件已添加，可以继续完善资料。");
    }).catch(cause => { if (!current) return; if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [softwareId, revision, router, draftKey]);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) { if (key === "slug") customSlug.current = true; setDraft(current => ({ ...current, [key]: value, ...(key === "name" && !customSlug.current ? { slug: automaticSlug("software", String(value), slugSuffix.current) } : {}) })); setDirty(true); setSuccess(""); }
  function updateLink(key: string, changes: Partial<OfficialLink>) {
    setDraft(current => ({ ...current, official_links: current.official_links.map(link => link.key === key ? { ...link, ...changes } : changes.is_primary ? { ...link, is_primary: false } : link) })); setDirty(true); setSuccess("");
  }
  function addLink() { update("official_links", [...draft.official_links, { key: crypto.randomUUID(), label: "", url: "", type: "download", platform: null, architecture: null, is_primary: draft.official_links.length === 0, is_active: true }]); }

  async function upload(file: File | undefined) {
    if (!file) return;
    setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) { setError("请选择 PNG、JPEG 或 WebP 格式的图标。"); return; }
    if (file.size > 2 * 1024 * 1024) { setError("图标不能超过 2 MB，请缩小后重新上传。"); return; }
    setUploading(true);
    const form = new FormData(); form.append("file", file);
    try { const result = await api<{ url: string }>("/admin/uploads/icon", { method: "POST", body: form }); update("icon_url", result.url); setSuccess("图标已上传，保存软件后生效。"); }
    catch (cause) { if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }
    finally { setUploading(false); }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(""); setSuccess("");
    if (draft.published && !draft.website_url.trim() && !draft.official_links.some(link => link.is_active && link.url.trim())) { setError("请填写官方网站，或添加至少一个启用的官方入口。"); const field = document.querySelector<HTMLInputElement>('[name="website_url"]'); field?.scrollIntoView({ block: "center" }); field?.focus(); return; }
    if (draft.official_links.some(link => link.is_primary && !link.is_active)) { setError("主要入口必须处于启用状态，请检查官方入口设置。"); return; }
    setBusy(true);
    const { latest_version, update_level, update_reason, ...softwareFields } = draft;
    void latest_version; void update_level; void update_reason;
    const links = draft.official_links.length ? draft.official_links : draft.website_url.trim() ? [{ label: "官方网站", url: draft.website_url.trim(), type: "website" as const, platform: null, architecture: null, is_primary: true, is_active: true }] : [];
    const payload = {
      ...softwareFields, name: draft.name.trim(), slug: draft.slug.trim(), category_id: draft.category_id || null,
      aliases: splitValues(draft.aliases), tags: splitValues(draft.tags), purposes: splitValues(draft.purposes),
      platforms: [...new Set(draft.platforms)],
      official_links: links.map(link => ({ ...("id" in link && link.id ? { id: link.id } : {}), label: link.label.trim(), url: link.url.trim(), type: link.type, platform: link.platform || null, architecture: link.architecture || null, is_primary: link.is_primary, is_active: link.is_active })),
    };
    try {
      const result = await api<Software>(softwareId ? `/admin/software/${softwareId}` : "/admin/software", { method: softwareId ? "PATCH" : "POST", body: JSON.stringify(payload) });
      clearSessionDraft(draftKey); setRecovered(false); setSaved(result); setDraft(editable(result)); setDirty(false); setSuccess(result.published ? "软件资料已保存，公开页面已更新。" : "软件资料已保存，当前仅在后台可见。");
      if (!softwareId) router.replace(`/admin/software/${result.id}/versions?created=1`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (cause) { if (isUnauthorized(cause)) router.replace("/admin/login"); else { setError(errorMessage(cause)); window.scrollTo({ top: 0, behavior: "smooth" }); } }
    finally { setBusy(false); }
  }

  if (loading) return <Loading text={softwareId ? "正在读取软件资料…" : "正在准备编辑器…"} />;
  if (softwareId && !saved) return <><Link href="/admin/software" className="adm-back"><ArrowLeft size={16} />返回软件管理</Link><Notice>{error || "软件资料暂时无法读取。"}</Notice><button className="adm-button adm-button-secondary" onClick={() => { setLoading(true); setError(""); setRevision(value => value + 1); }}>重新加载</button></>;

  return <>
    <Link href="/admin/software" className="adm-back"><ArrowLeft size={16} />返回软件管理</Link>
    <header className="adm-page-heading"><div><h1>{softwareId ? "编辑软件" : "添加软件"}</h1><p>{softwareId ? `维护 ${saved?.name || "软件"} 的资料与官方入口。` : "先填写名称、简介和官网；保存后进入版本管理。"}</p></div>{saved && <Link href={`/admin/software/${saved.id}/versions`} className="adm-button"><Link2 size={17} />版本管理</Link>}</header>
    {error && <Notice>{error}</Notice>}{success && <Notice success>{success}</Notice>}
    {recovered && <div className="adm-workflow-banner" role="status"><div><strong>已恢复尚未保存的内容</strong><p>这些内容来自当前标签页的临时草稿，还没有提交。请检查后保存。</p></div></div>}
    <form onSubmit={save} className="adm-editor adm-task-editor adm-software-task"><div className="adm-editor-main">
      <section className="adm-panel adm-form-section" aria-labelledby="basic-heading"><div className="adm-section-heading"><h2 id="basic-heading">基本资料</h2><span className="adm-muted">带 * 的字段为必填</span></div><div className="adm-form-grid">
        <label className="adm-field adm-full">软件名称 <span className="adm-required">*</span><input name="name" required maxLength={160} value={draft.name} onChange={event => update("name", event.target.value)} placeholder="例如：Visual Studio Code" /></label>
        <label className="adm-field adm-full">一句话简介 <span className="adm-required">*</span><input name="summary" required maxLength={500} value={draft.summary} onChange={event => update("summary", event.target.value)} placeholder="用一句话说明这款软件能解决什么问题" /></label>
        <label className="adm-field adm-full">官方网站<input name="website_url" type="url" maxLength={2048} pattern="https://.+" title="请填写以 https:// 开头的官方地址" value={draft.website_url} onChange={event => update("website_url", event.target.value)} placeholder="https://example.com" /><small>未单独配置其他入口时，官网会自动作为这款软件的官方来源。</small></label>
        <label className="adm-checkbox adm-full"><input name="is_demo" type="checkbox" disabled={!!saved?.current_release_id} checked={draft.is_demo} onChange={event => update("is_demo", event.target.checked)} />这是演示软件，相关版本默认标记为演示</label>
        <label className="adm-field">短名称<input name="short_name" maxLength={80} value={draft.short_name} onChange={event => update("short_name", event.target.value)} placeholder="例如：VS Code" /></label>
        <label className="adm-field">所属分类<select name="category_id" value={draft.category_id} onChange={event => update("category_id", event.target.value)}><option value="">暂不分类</option>{categories.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="adm-field adm-full">详细介绍<textarea name="description" rows={6} maxLength={30000} value={draft.description} onChange={event => update("description", event.target.value)} placeholder="介绍适用场景、主要功能及使用说明。使用纯文本即可。" /></label>
        <details className="adm-full adm-inline-advanced"><summary>网址高级设置（已自动生成）</summary><label className="adm-field">网址标识<input name="slug" maxLength={160} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" value={draft.slug} onChange={event => update("slug", event.target.value)} /><small>无需手动填写；发布后建议保持不变。</small></label></details>
      </div></section>

      <section className="adm-panel adm-form-section" aria-labelledby="discover-heading"><div className="adm-section-heading"><h2 id="discover-heading">帮助用户找到它</h2></div><p className="adm-section-intro">有人记得名字，有人只记得用途。补充常用说法，让搜索更容易命中。</p><div className="adm-form-grid">
        <label className="adm-field adm-full">别名与常用叫法<input name="aliases" value={draft.aliases} onChange={event => update("aliases", event.target.value)} placeholder="例如：VSCode，微软代码编辑器，蓝色代码编辑器" /><small>多个词语用逗号分隔；别名会参与搜索。</small></label>
        <label className="adm-field">用途<input name="purposes" value={draft.purposes} onChange={event => update("purposes", event.target.value)} placeholder="例如：写代码，开发网站" /><small>多个用途用逗号分隔。</small></label>
        <label className="adm-field">标签<input name="tags" value={draft.tags} onChange={event => update("tags", event.target.value)} placeholder="例如：开源，免费，编辑器" /><small>多个标签用逗号分隔。</small></label>
        <fieldset className="adm-fieldset adm-full"><legend>支持的平台</legend><div className="adm-platform-options">{platformOptions.map(platform => <label className="adm-check-chip" key={platform.value}><input type="checkbox" checked={draft.platforms.includes(platform.value)} onChange={event => update("platforms", event.target.checked ? [...draft.platforms, platform.value] : draft.platforms.filter(item => item !== platform.value))} /><span>{platform.label}</span></label>)}</div></fieldset>
      </div></section>

      <section className="adm-panel adm-form-section" aria-labelledby="official-heading"><div className="adm-section-heading"><h2 id="official-heading"><Globe size={19} />官方资料</h2></div><div className="adm-form-grid"><label className="adm-field">官方文档<input name="docs_url" type="url" maxLength={2048} pattern="https://.+" title="请填写以 https:// 开头的官方地址" value={draft.docs_url} onChange={event => update("docs_url", event.target.value)} placeholder="https://…" /></label><label className="adm-field">GitHub 项目<input name="github_url" type="url" maxLength={2048} pattern="https://.+" title="请填写以 https:// 开头的官方地址" value={draft.github_url} onChange={event => update("github_url", event.target.value)} placeholder="https://github.com/…" /></label></div></section>

      <section className="adm-panel adm-form-section" aria-labelledby="links-heading"><div className="adm-section-heading"><h2 id="links-heading"><Link2 size={19} />官方入口</h2><button className="adm-button adm-button-secondary adm-button-small" type="button" onClick={addLink}><Plus size={16} />添加入口</button></div><p className="adm-section-intro">为不同平台设置下载页或官方商店地址。用户将跳转到这些已保存的官方来源。</p>
        {!draft.official_links.length && <div className="adm-link-empty"><Link2 size={25} /><p>还没有添加官方入口</p><button type="button" className="adm-text-link" onClick={addLink}>添加第一个入口</button></div>}
        <div className="adm-links">{draft.official_links.map((link, index) => <div className="adm-link-editor" key={link.key}><div className="adm-link-top"><strong>入口 {index + 1}</strong><button type="button" className="adm-icon-button adm-danger-text" aria-label={`移除入口 ${index + 1}`} onClick={() => update("official_links", draft.official_links.filter(item => item.key !== link.key))}><Trash2 size={16} /></button></div><div className="adm-form-grid"><label className="adm-field">显示名称 <span className="adm-required">*</span><input required maxLength={100} value={link.label} onChange={event => updateLink(link.key, { label: event.target.value })} placeholder="例如：Windows 官方下载" /></label><label className="adm-field">入口类型<select value={link.type} onChange={event => updateLink(link.key, { type: event.target.value as OfficialLink["type"] })}>{linkTypes.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></label><label className="adm-field adm-full">官方地址 <span className="adm-required">*</span><input type="url" maxLength={2048} pattern="https://.+" title="请填写以 https:// 开头的官方地址" required value={link.url} onChange={event => updateLink(link.key, { url: event.target.value })} placeholder="https://…" /></label><label className="adm-field">适用平台<select value={link.platform || ""} onChange={event => updateLink(link.key, { platform: event.target.value || null })}><option value="">所有平台</option>{platformOptions.map(platform => <option key={platform.value} value={platform.value}>{platform.label}</option>)}</select></label><label className="adm-field">处理器架构<select value={link.architecture || ""} onChange={event => updateLink(link.key, { architecture: event.target.value || null })}><option value="">未指定</option><option value="x64">x64</option><option value="arm64">ARM64</option><option value="universal">通用架构</option><option value="x86">x86</option></select></label></div><div className="adm-link-switches"><label className="adm-checkbox"><input type="checkbox" checked={link.is_primary} onChange={event => updateLink(link.key, { is_primary: event.target.checked, ...(event.target.checked ? { is_active: true } : {}) })} />主要入口</label><label className="adm-checkbox"><input type="checkbox" checked={link.is_active} onChange={event => updateLink(link.key, { is_active: event.target.checked, ...(!event.target.checked ? { is_primary: false } : {}) })} />启用此入口</label></div></div>)}</div>
      </section>

      {saved && <section className="adm-panel adm-form-section" aria-labelledby="version-heading"><div className="adm-section-heading"><h2 id="version-heading">版本记录</h2><Link href={`/admin/software/${saved.id}/versions`} className="adm-text-link">版本管理<ArrowUpRight size={14} /></Link></div><p>档案当前版本：<strong>{saved.latest_version || "尚未发布"}</strong>{saved.is_demo ? "（演示）" : ""}</p><p className="adm-page-note">新版本和历史版本请在版本管理中发布或补录。修改软件资料不会创建版本历史，也不会覆盖版本公告维护的当前版本。</p></section>}

      <section className="adm-panel adm-form-section" aria-labelledby="seo-heading"><div className="adm-section-heading"><h2 id="seo-heading">搜索引擎展示</h2><span className="adm-muted">可选填写</span></div><div className="adm-form-grid"><label className="adm-field adm-full">页面标题<input name="seo_title" maxLength={200} value={draft.seo_title} onChange={event => update("seo_title", event.target.value)} placeholder="留空时使用软件名称" /></label><label className="adm-field adm-full">页面描述<textarea name="seo_description" maxLength={500} rows={3} value={draft.seo_description} onChange={event => update("seo_description", event.target.value)} placeholder="留空时使用一句话简介" /></label></div></section>
    </div>

    <aside className="adm-editor-aside"><section className="adm-panel adm-publish-panel"><h2>发布设置</h2><label className="adm-publish-toggle"><input type="checkbox" checked={draft.published} onChange={event => update("published", event.target.checked)} /><span><strong>在公开站点展示</strong><small>{draft.published ? "保存后，访客可以找到这款软件。" : "保存后，仅管理员可见。"}</small></span></label><div className="adm-publish-status"><span className={`adm-status ${draft.published ? "adm-status-published" : "adm-status-draft"}`}><span />{draft.published ? "公开发布" : "未发布"}</span>{dirty && <small>有未保存的修改</small>}</div><p className="adm-page-note">发布前请核对资料及官方地址。所有修改都会记录在操作日志中。</p></section>
      <section className="adm-panel adm-icon-panel"><h2>软件图标</h2><div className="adm-icon-preview"><SoftwareIcon url={draft.icon_url} name={draft.name || "软件"} /><span>{draft.icon_url ? <><Check size={15} />已设置图标</> : "便于用户识别软件"}</span></div><label className={`adm-button adm-button-secondary adm-upload-label ${uploading ? "is-disabled" : ""}`}><ImagePlus size={17} />{uploading ? "正在上传…" : "上传图标"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={event => { void upload(event.target.files?.[0]); event.target.value = ""; }} /></label><p className="adm-page-note">PNG、JPEG 或 WebP，最大 2 MB。</p><label className="adm-field">图标地址<input name="icon_url" value={draft.icon_url} readOnly placeholder="上传后自动填写" /></label>{draft.icon_url && <button type="button" className="adm-text-link adm-danger-text" onClick={() => update("icon_url", "")}>移除图标</button>}</section>
    </aside><div className="adm-workflow-actions"><span>{busy ? "正在保存…" : dirty ? "有未保存的修改" : "软件资料"}</span><button type="submit" disabled={busy || uploading} className="adm-button"><Save size={17} />{busy ? "正在保存…" : !softwareId ? "保存软件并管理版本" : "保存软件资料"}</button></div></form>{unsavedDialog}
  </>;
}
