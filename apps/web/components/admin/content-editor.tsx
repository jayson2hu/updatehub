"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Archive, ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, CheckCircle2, Eye, Plus, Save, Send, Trash2, X } from "lucide-react";
import { api } from "@/lib/api";
import { contentAdminPath, contentKinds, contentPublicPath, type ContentDocument, type ContentImportance, type ContentKind } from "@/lib/content-types";
import type { Category, Paginated, Software } from "@/lib/types";
import { ConfirmDialog, errorMessage, formatDate, isUnauthorized, Loading, Notice, SoftwareIcon } from "./ui";
import { automaticSlug, clearSessionDraft, readSessionDraft, useSessionDraft, useUnsavedNavigation } from "./workflow";

type SectionDraft = { key: string; title: string; body: string };
type ItemDraft = { key: string; id?: string; software_id: string; importance: ContentImportance; note: string };
type Draft = { slug: string; title: string; summary: string; content: string; sections: SectionDraft[]; software_id: string | null; category_id: string | null; platforms: string[]; purposes: string; sort_order: number; is_demo: boolean; items: ItemDraft[] };
type Issue = { name: string; label: string };
const platforms = [{ value: "windows", label: "Windows" }, { value: "macos", label: "macOS" }, { value: "linux", label: "Linux" }, { value: "android", label: "Android" }, { value: "ios", label: "iOS" }, { value: "web", label: "Web" }];
const importanceNames = { required: "必备", recommended: "推荐", optional: "可选" };
const blank: Draft = { slug: "", title: "", summary: "", content: "", sections: [], software_id: null, category_id: null, platforms: [], purposes: "", sort_order: 0, is_demo: false, items: [] };

function toDraft(item: ContentDocument): Draft {
  return { slug: item.slug, title: item.title, summary: item.summary, content: item.content, sections: item.sections.map(section => ({ ...section, key: crypto.randomUUID() })), software_id: item.software_id, category_id: item.category_id, platforms: item.platforms, purposes: item.purposes.join("，"), sort_order: item.sort_order, is_demo: item.is_demo, items: item.items.map(member => ({ key: member.id, id: member.id, software_id: member.software_id, importance: member.importance, note: member.note })) };
}

async function loadSoftware() {
  const first = await api<Paginated<Software>>("/admin/software?page_size=100");
  const rows = [...first.items];
  for (let page = 2; rows.length < first.total; page += 1) { const next = await api<Paginated<Software>>(`/admin/software?page_size=100&page=${page}`); if (!next.items.length) break; rows.push(...next.items); }
  return rows;
}

function ContentPreview({ draft, kind, software }: { draft: Draft; kind: ContentKind; software: Software[] }) {
  const associated = kind !== "collection" ? software.find(item => item.id === draft.software_id) : undefined;
  return <article className="adm-content-preview"><div className="adm-content-row-meta"><span>{contentKinds[kind].name}</span>{associated && <span>{associated.name}</span>}{draft.is_demo && <span className="adm-demo-label">演示内容</span>}</div><h2>{draft.title || "尚未填写标题"}</h2>{(draft.summary || kind !== "faq") && <p className="adm-preview-summary">{draft.summary || "尚未填写简介"}</p>}{draft.is_demo && <div className="adm-preview-demo">这是演示内容，仅用于说明平台功能，请勿作为真实操作建议。</div>}<div className="adm-content-prose">{draft.content || (kind === "faq" ? "尚未填写详细解答" : kind === "guide" && !draft.sections.length ? "尚未填写正文或操作步骤" : "")}</div>{kind === "guide" && draft.sections.map((section, index) => <section key={section.key}><h3>{index + 1}. {section.title || "尚未填写步骤标题"}</h3><div className="adm-content-prose">{section.body || "尚未填写操作说明"}</div></section>)}{kind === "collection" && <ol className="adm-collection-preview">{draft.items.map(member => { const item = software.find(row => row.id === member.software_id); return <li key={member.key}><div><strong>{item?.name || "软件暂时无法读取"}</strong><span>{importanceNames[member.importance]}</span></div><p>{member.note || item?.summary || "尚未填写选择理由"}</p></li>; })}</ol>}</article>;
}

export function ContentEditor({ kind, contentId, initialSoftwareId }: { kind: ContentKind; contentId?: string; initialSoftwareId?: string }) {
  const router = useRouter();
  const config = contentKinds[kind];
  const [draft, setDraft] = useState<Draft>(blank);
  const [saved, setSaved] = useState<ContentDocument | null>(null);
  const [software, setSoftware] = useState<Software[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [recovered, setRecovered] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [issues, setIssues] = useState<Issue[]>([]);
  const [revision, setRevision] = useState(0);
  const [previewMode, setPreviewMode] = useState<"preview" | "publish" | null>(null);
  const [confirmation, setConfirmation] = useState<"unpublish" | "archive" | null>(null);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberSelection, setMemberSelection] = useState("");
  const [checkingSoftware, setCheckingSoftware] = useState(false);
  const suffix = useRef("");
  const customSlug = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const locked = !!saved && saved.status !== "draft";
  const draftKey = `updatehub:content-draft:${kind}:${contentId || `new:${initialSoftwareId || "general"}`}`;
  const unsavedDialog = useUnsavedNavigation(dirty, () => clearSessionDraft(draftKey));
  useSessionDraft(draftKey, draft, dirty, !loading, saved?.updated_at || null);
  const associated = kind !== "collection" ? software.find(item => item.id === draft.software_id) : undefined;
  const availableSoftware = software.filter(item => !draft.items.some(member => member.software_id === item.id) && `${item.name} ${item.short_name || ""}`.toLowerCase().includes(memberSearch.toLowerCase().trim()));

  useEffect(() => {
    let current = true;
    Promise.all([loadSoftware(), api<Category[]>("/categories"), contentId ? api<ContentDocument>(`/admin/content/${contentId}`) : Promise.resolve(null)]).then(([rows, categoryRows, document]) => {
      if (!current) return;
      if (document && document.kind !== kind) throw new Error("这条内容属于其他栏目，请返回列表重新打开。");
      suffix.current = crypto.randomUUID().slice(0, 8); customSlug.current = !!document;
      const selected = kind !== "collection" ? rows.find(item => item.id === initialSoftwareId) : undefined;
      const initial = document ? toDraft(document) : { ...blank, slug: automaticSlug(kind, "", suffix.current), software_id: selected?.id || null, is_demo: selected?.is_demo || false };
      const temporary = !document || document.status === "draft" ? readSessionDraft(draftKey, initial, document?.updated_at || null) : null;
      setSoftware(rows); setCategories(categoryRows); setSaved(document); setDraft(temporary || initial); setDirty(!!temporary); setRecovered(!!temporary); setError(""); setLoadFailed(false);
      if (temporary) customSlug.current = true;
      const params = new URLSearchParams(window.location.search);
      if (params.has("saved")) setSuccess("草稿已保存，可继续编辑或预览发布。");
      if (params.has("preview") && document?.status === "draft" && !temporary) setPreviewMode("publish");
    }).catch(cause => { if (!current) return; setLoadFailed(true); if (isUnauthorized(cause)) router.replace("/admin/login"); else setError(errorMessage(cause)); }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [kind, contentId, initialSoftwareId, revision, draftKey, router]);

  useEffect(() => { if (previewMode && !dialog.current?.open) dialog.current?.showModal(); if (!previewMode && dialog.current?.open) dialog.current?.close(); }, [previewMode]);

  function change<K extends keyof Draft>(key: K, value: Draft[K]) {
    if (key === "slug") customSlug.current = true;
    setDraft(current => ({ ...current, [key]: value, ...(key === "title" && !customSlug.current ? { slug: automaticSlug(kind, String(value), suffix.current) } : {}), ...(key === "software_id" ? { is_demo: software.find(item => item.id === value)?.is_demo || current.items.some(member => software.find(item => item.id === member.software_id)?.is_demo) } : {}) }));
    setDirty(true); setSuccess(""); setIssues(current => current.filter(issue => issue.name !== key));
  }
  function changeSection(key: string, values: Partial<SectionDraft>) { change("sections", draft.sections.map(section => section.key === key ? { ...section, ...values } : section)); }
  function changeMember(key: string, values: Partial<ItemDraft>) { change("items", draft.items.map(member => member.key === key ? { ...member, ...values } : member)); }
  function move(key: "sections" | "items", from: number, offset: number) { const rows = [...draft[key]]; const target = from + offset; if (target < 0 || target >= rows.length) return; [rows[from], rows[target]] = [rows[target], rows[from]]; change(key, rows as SectionDraft[] & ItemDraft[]); }
  function addMember() { const item = software.find(row => row.id === memberSelection); if (!item || draft.items.some(member => member.software_id === item.id)) return; change("items", [...draft.items, { key: crypto.randomUUID(), software_id: item.id, importance: "recommended", note: "" }]); if (item.is_demo) change("is_demo", true); setMemberSelection(""); setMemberSearch(""); }
  function locate(name: string) { const element = document.getElementsByName(name)[0] as HTMLElement | undefined; const details = element?.closest("details"); if (details) details.open = true; element?.scrollIntoView({ block: "center", behavior: "smooth" }); element?.focus({ preventScroll: true }); }
  function invalid(name: string) { return issues.some(issue => issue.name === name); }
  function validate(publishing: boolean) {
    const missing: Issue[] = [];
    if (!draft.title.trim()) missing.push({ name: "title", label: kind === "faq" ? "问题" : "标题" });
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(draft.slug)) missing.push({ name: "slug", label: "有效的网址标识" });
    const purposes = draft.purposes.split(/[,，\n]/).map(value => value.trim()).filter(Boolean);
    if (purposes.length > 20 || purposes.some(value => value.length > 80)) missing.push({ name: "purposes", label: "用途最多 20 个，每个不超过 80 字" });
    if (!Number.isInteger(draft.sort_order) || draft.sort_order < -10000 || draft.sort_order > 10000) missing.push({ name: "sort_order", label: "排序须为 -10000 到 10000 的整数" });
    if (publishing) {
      if (kind !== "faq" && !draft.summary.trim()) missing.push({ name: "summary", label: "简介" });
      if ((kind === "faq" || kind === "guide" && !draft.sections.length) && !draft.content.trim()) missing.push({ name: "content", label: kind === "faq" ? "详细解答" : "正文或操作步骤" });
      if (associated && !associated.published) missing.push({ name: "software_id", label: "关联软件尚未公开" });
      if (!draft.is_demo && (associated?.is_demo || draft.items.some(member => software.find(item => item.id === member.software_id)?.is_demo))) missing.push({ name: "is_demo", label: "包含演示软件，请保留演示标记" });
      if (kind === "guide") draft.sections.forEach((section, index) => { if (!section.title.trim()) missing.push({ name: `section-${index}-title`, label: `第 ${index + 1} 步的标题` }); if (!section.body.trim()) missing.push({ name: `section-${index}-body`, label: `第 ${index + 1} 步的说明` }); });
      if (kind === "collection") { if (!draft.items.length) missing.push({ name: "member_software", label: "至少一款合集软件" }); draft.items.forEach((member, index) => { if (!software.find(item => item.id === member.software_id)?.published) missing.push({ name: `item-${index}-note`, label: `第 ${index + 1} 款软件尚未公开` }); }); }
    }
    setIssues(missing);
    if (missing.length) { setError("还有内容需要补充或检查。点击下方项目可直接定位。"); requestAnimationFrame(() => locate(missing[0].name)); return false; }
    return true;
  }
  function applySaved(item: ContentDocument) { clearSessionDraft(draftKey); setSaved(item); setDraft(toDraft(item)); setDirty(false); setRecovered(false); setIssues([]); }
  function fail(cause: unknown) { if (isUnauthorized(cause)) router.replace("/admin/login"); else { setError(errorMessage(cause)); window.scrollTo({ top: 0, behavior: "smooth" }); } }
  async function refreshSoftware() { setCheckingSoftware(true); try { setSoftware(await loadSoftware()); setError(""); } catch (cause) { fail(cause); } finally { setCheckingSoftware(false); } }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked) return;
    const preview = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "preview";
    if (!validate(preview)) return;
    setBusy(true); setError(""); setSuccess("");
    const payload = { ...draft, kind, software_id: kind === "collection" ? null : draft.software_id, title: draft.title.trim(), slug: draft.slug.trim(), sections: draft.sections.map(section => ({ title: section.title.trim(), body: section.body.trim() })), purposes: [...new Set(draft.purposes.split(/[,，\n]/).map(value => value.trim()).filter(Boolean))], items: draft.items.map((item, index) => ({ ...(item.id ? { id: item.id } : {}), software_id: item.software_id, sort_order: index, importance: item.importance, note: item.note.trim() })) };
    try { const item = await api<ContentDocument>(contentId ? `/admin/content/${contentId}` : "/admin/content", { method: contentId ? "PATCH" : "POST", body: JSON.stringify(payload) }); applySaved(item); setSuccess("草稿已保存，可继续编辑或预览发布。"); if (!contentId) router.replace(`${contentAdminPath(kind, item.id)}?${preview ? "preview" : "saved"}=1`); else if (preview) setPreviewMode("publish"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (cause) { fail(cause); } finally { setBusy(false); }
  }
  async function publish() {
    if (!saved || dirty || saved.status !== "draft") return;
    setBusy(true); setError(""); setSuccess("");
    try { const item = await api<ContentDocument>(`/admin/content/${saved.id}/publish`, { method: "POST", body: JSON.stringify({ confirmed: true }) }); applySaved(item); setPreviewMode(null); setSuccess(`${config.name}已发布，访客现在可以在公开站点找到这条内容。`); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (cause) { setPreviewMode(null); fail(cause); } finally { setBusy(false); }
  }
  async function changeState(action: "unpublish" | "archive") {
    if (!saved) return; setBusy(true); setError(""); setSuccess("");
    try { const item = await api<ContentDocument>(`/admin/content/${saved.id}/${action}`, { method: "POST", body: JSON.stringify({}) }); applySaved(item); setSuccess(action === "unpublish" ? "内容已回到草稿，公开站点不再展示。修改后需要重新确认发布。" : "内容已归档，公开站点不再展示。需要时可恢复为草稿。"); window.scrollTo({ top: 0, behavior: "smooth" }); }
    catch (cause) { fail(cause); } finally { setBusy(false); setConfirmation(null); }
  }

  if (loading) return <Loading text={`正在准备${config.name}编辑器…`} />;
  if (loadFailed) return <><Link className="adm-back" href={contentAdminPath(kind)}><ArrowLeft size={16} />返回{config.heading}</Link><Notice>{error}</Notice><button className="adm-button adm-button-secondary" onClick={() => { setLoading(true); setError(""); setRevision(value => value + 1); }}>重新加载</button></>;

  return <>
    <Link className="adm-back" href={contentAdminPath(kind)}><ArrowLeft size={16} />返回{config.heading}</Link>
    <header className="adm-page-heading"><div><h1>{locked ? `管理${config.name}` : contentId ? `编辑${config.name}` : kind === "faq" ? "添加问题" : `新建${config.name}`}</h1><p>{config.description}</p></div><button type="button" className="adm-button adm-button-secondary" onClick={() => setPreviewMode("preview")}><Eye size={17} />预览内容</button></header>
    {error && <Notice>{error}</Notice>}{issues.length > 0 && <div className="adm-field-issues" role="alert"><strong>请检查以下内容</strong>{issues.map(issue => <button key={issue.name} type="button" onClick={() => locate(issue.name)}>{issue.label}<ArrowUpRight size={13} /></button>)}</div>}
    {success && <div className="adm-workflow-success"><Notice success>{success}</Notice>{saved?.status === "published" && <div className="adm-actions"><Link className="adm-button adm-button-secondary" href={contentPublicPath(saved)} target="_blank" rel="noopener noreferrer">查看公开页面<ArrowUpRight size={15} /></Link><Link className="adm-button adm-button-secondary" href={contentAdminPath(kind)}>返回{config.heading}</Link></div>}</div>}
    {recovered && <div className="adm-workflow-banner" role="status"><div><strong>已恢复尚未保存的内容</strong><p>这些内容来自当前标签页的临时草稿，还没有提交。请检查后保存。</p></div></div>}
    {locked && <div className="adm-workflow-banner"><CheckCircle2 size={22} /><div><strong>{saved?.status === "published" ? "这条内容已公开，编辑前请先下线" : "这条内容已归档"}</strong><p>{saved?.status === "published" ? "下线后可修改草稿；再次预览并确认发布后，访客才会看到新内容。" : "恢复为草稿后可以修改，公开展示仍需手动确认发布。"}</p><button type="button" className="adm-button adm-button-secondary" disabled={busy} onClick={() => saved?.status === "published" ? setConfirmation("unpublish") : void changeState("unpublish")}>{saved?.status === "published" ? "下线后编辑" : "恢复为草稿"}</button></div></div>}
    <form onSubmit={save} noValidate className="adm-content-editor adm-task-editor">
      <fieldset disabled={locked || busy} className="adm-content-form-fields"><legend className="adm-sr-only">{config.name}内容</legend><div className="adm-editor-main">
        <section className="adm-panel adm-form-section"><div className="adm-section-heading"><h2>{kind === "faq" ? "问题与回答" : "基本内容"}</h2><span className="adm-muted">发布前请补全必填项</span></div><div className="adm-form-grid">
          <label className="adm-field adm-full">{kind === "faq" ? "问题" : kind === "collection" ? "合集名称" : "指南标题"} <span className="adm-required">*</span><input name="title" maxLength={200} value={draft.title} aria-invalid={invalid("title")} onChange={event => change("title", event.target.value)} placeholder={kind === "faq" ? "用用户会问的方式写，例如：更新前需要备份什么？" : kind === "collection" ? "例如：搭建日常写作环境" : "例如：第一次使用前，完成这几项设置"} /></label>
          <label className="adm-field adm-full">{kind === "faq" ? "简短回答（可选）" : kind === "collection" ? "适合什么需求" : "简介"} {kind !== "faq" && <span className="adm-required">*</span>}<textarea name="summary" rows={2} maxLength={600} value={draft.summary} aria-invalid={invalid("summary")} onChange={event => change("summary", event.target.value)} placeholder={kind === "faq" ? "先用一两句话直接回答问题。" : "说明适合谁、解决什么问题。"} /></label>
          {kind === "collection" && <label className="adm-field adm-full">适用用途<input name="purposes" value={draft.purposes} aria-invalid={invalid("purposes")} onChange={event => change("purposes", event.target.value)} placeholder="例如：开始写作，远程协作，学习编程" /><small>多个用途用逗号分隔。这些词会成为新手入口的用途选项，请用用户熟悉的说法。</small></label>}
          <label className="adm-field adm-full">{kind === "faq" ? "详细解答" : kind === "collection" ? "选择与使用说明" : "正文"}{(kind === "faq" || kind === "guide" && !draft.sections.length) && <span className="adm-required"> *</span>}<textarea name="content" rows={kind === "faq" ? 7 : 5} maxLength={60000} value={draft.content} aria-invalid={invalid("content")} onChange={event => change("content", event.target.value)} placeholder={kind === "faq" ? "解释原因、操作方法与适用条件。" : kind === "collection" ? "说明软件如何搭配，以及选择时需要考虑什么。" : "先说明适用条件、准备工作和预期结果，具体步骤可在下方逐项添加。"} /><small>用普通文字分段撰写即可，系统会保留段落。{kind === "guide" && "正文与下方操作步骤至少填写一项。"}</small></label>
        </div></section>
        {kind === "guide" && <section className="adm-panel adm-form-section"><div className="adm-section-heading"><h2>操作步骤</h2><button type="button" className="adm-button adm-button-secondary" disabled={draft.sections.length >= 30} onClick={() => change("sections", [...draft.sections, { key: crypto.randomUUID(), title: "", body: "" }])}><Plus size={16} />添加步骤</button></div><p className="adm-section-intro">每一步说明要做什么、怎么判断完成。可上下移动调整顺序。</p>{!draft.sections.length && <div className="adm-content-inline-empty">如果正文已经足够清楚，可以不添加步骤。</div>}<div className="adm-step-editors">{draft.sections.map((section, index) => <section className="adm-content-step" key={section.key}><div className="adm-member-heading"><strong>第 {index + 1} 步</strong><div className="adm-actions"><button type="button" className="adm-icon-button" aria-label={`上移第 ${index + 1} 步`} disabled={index === 0} onClick={() => move("sections", index, -1)}><ArrowUp size={17} /></button><button type="button" className="adm-icon-button" aria-label={`下移第 ${index + 1} 步`} disabled={index === draft.sections.length - 1} onClick={() => move("sections", index, 1)}><ArrowDown size={17} /></button><button type="button" className="adm-icon-button adm-danger-text" aria-label={`移除第 ${index + 1} 步`} onClick={() => change("sections", draft.sections.filter(item => item.key !== section.key))}><Trash2 size={17} /></button></div></div><label className="adm-field">步骤标题<input name={`section-${index}-title`} maxLength={160} value={section.title} aria-invalid={invalid(`section-${index}-title`)} onChange={event => changeSection(section.key, { title: event.target.value })} placeholder="用动作开头，例如：备份现有设置" /></label><label className="adm-field">操作说明<textarea name={`section-${index}-body`} rows={4} maxLength={10000} value={section.body} aria-invalid={invalid(`section-${index}-body`)} onChange={event => changeSection(section.key, { body: event.target.value })} placeholder="说明具体做法，以及需要注意的地方。" /></label></section>)}</div></section>}
        {kind === "collection" && <section className="adm-panel adm-form-section"><div className="adm-section-heading"><h2>合集中的软件</h2><span className="adm-muted">{draft.items.length} 款 · 按显示顺序排列</span></div><p className="adm-section-intro">添加软件后写下选择理由。列表靠前的软件会先展示。</p><div className="adm-member-picker"><label className="adm-field">查找软件<input aria-label="查找要加入的软件" value={memberSearch} onChange={event => { setMemberSearch(event.target.value); setMemberSelection(""); }} placeholder="输入软件名称缩小范围" /></label><label className="adm-field">选择软件<select name="member_software" value={memberSelection} aria-invalid={invalid("member_software")} onChange={event => setMemberSelection(event.target.value)}><option value="">{availableSoftware.length ? "请选择要加入的软件" : "没有可添加的软件"}</option>{availableSoftware.map(item => <option key={item.id} value={item.id}>{item.name}{item.published ? "" : "（未公开）"}</option>)}</select></label><button className="adm-button adm-button-secondary" type="button" disabled={!memberSelection || draft.items.length >= 100} onClick={addMember}><Plus size={16} />加入合集</button></div>{!draft.items.length && <div className="adm-content-inline-empty">尚未添加软件。发布合集前，至少添加一款已公开的软件。</div>}<div className="adm-collection-editors">{draft.items.map((member, index) => { const item = software.find(row => row.id === member.software_id); return <section className="adm-content-member" key={member.key}><div className="adm-member-heading"><div><span className="adm-member-position">{index + 1}</span><SoftwareIcon name={item?.name || "?"} url={item?.icon_url} /><strong>{item?.name || "软件暂时无法读取"}</strong></div><div className="adm-actions"><button type="button" className="adm-icon-button" aria-label={`上移 ${item?.name}`} disabled={index === 0} onClick={() => move("items", index, -1)}><ArrowUp size={17} /></button><button type="button" className="adm-icon-button" aria-label={`下移 ${item?.name}`} disabled={index === draft.items.length - 1} onClick={() => move("items", index, 1)}><ArrowDown size={17} /></button><button type="button" className="adm-icon-button adm-danger-text" aria-label={`移除 ${item?.name}`} onClick={() => change("items", draft.items.filter(row => row.key !== member.key))}><Trash2 size={17} /></button></div></div>{item && !item.published && <Notice>这款软件尚未公开。请先<Link href={`/admin/software/${item.id}`} className="adm-text-link" target="_blank" rel="noopener noreferrer">公开软件资料</Link>，再发布合集。</Notice>}<label className="adm-field">推荐程度<select name={`item-${index}-importance`} value={member.importance} onChange={event => changeMember(member.key, { importance: event.target.value as ContentImportance })}>{Object.entries(importanceNames).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label><label className="adm-field">选择理由 / 使用提示<textarea name={`item-${index}-note`} rows={3} maxLength={3000} value={member.note} aria-invalid={invalid(`item-${index}-note`)} onChange={event => changeMember(member.key, { note: event.target.value })} placeholder="说明为什么选择它、与其他软件如何搭配。" /></label></section>; })}</div></section>}
        <details className="adm-panel adm-workflow-details"><summary>查找与网址设置 <span>可选填写</span></summary><div className="adm-form-grid">{kind !== "collection" && <label className="adm-field adm-full">用途关键词<input name="purposes" value={draft.purposes} aria-invalid={invalid("purposes")} onChange={event => change("purposes", event.target.value)} placeholder="例如：备份设置，开始写作；多个词用逗号分隔" /></label>}<label className="adm-field adm-full">网址标识<input name="slug" maxLength={160} value={draft.slug} aria-invalid={invalid("slug")} onChange={event => change("slug", event.target.value)} /><small>已自动生成，通常无需修改。发布后请尽量保持稳定。</small></label><label className="adm-field">列表排序<input name="sort_order" type="number" min={-10000} max={10000} value={draft.sort_order} onChange={event => change("sort_order", Number(event.target.value) || 0)} /><small>数字较小的内容优先展示，同值时按发布时间排序。</small></label></div></details>
      </div><aside className="adm-editor-aside"><section className="adm-panel adm-publish-panel"><h2>展示范围</h2>{kind !== "collection" && <label className="adm-field">关联软件<select name="software_id" value={draft.software_id || ""} aria-invalid={invalid("software_id")} onChange={event => change("software_id", event.target.value || null)}><option value="">通用内容，不限定软件</option>{software.map(item => <option key={item.id} value={item.id}>{item.name}{item.published ? "" : "（未公开）"}</option>)}</select><small>关联后，可在这款软件的页面找到这条内容。</small></label>}{kind !== "collection" && associated && !associated.published && <p className="adm-page-note">关联软件尚未公开，请先<Link className="adm-text-link" href={`/admin/software/${associated.id}`} target="_blank" rel="noopener noreferrer">检查软件资料</Link>。</p>}{(associated && !associated.published || draft.items.some(member => !software.find(item => item.id === member.software_id)?.published)) && <button type="button" className="adm-button adm-button-secondary" disabled={checkingSoftware} onClick={refreshSoftware}>{checkingSoftware ? "正在检查…" : "重新检查软件状态"}</button>}<label className="adm-field">内容分类<select name="category_id" value={draft.category_id || ""} onChange={event => change("category_id", event.target.value || null)}><option value="">暂不分类</option>{categories.map(category => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label><fieldset className="adm-fieldset"><legend>适用平台</legend><div className="adm-platform-options">{platforms.map(platform => <label className="adm-check-chip" key={platform.value}><input type="checkbox" checked={draft.platforms.includes(platform.value)} onChange={event => change("platforms", event.target.checked ? [...draft.platforms, platform.value] : draft.platforms.filter(value => value !== platform.value))} /><span>{platform.label}</span></label>)}</div></fieldset><label className="adm-checkbox adm-update-option"><input name="is_demo" type="checkbox" checked={draft.is_demo} onChange={event => change("is_demo", event.target.checked)} />这是演示内容</label><p className="adm-page-note">演示内容会显示明显标记，不应作为真实操作建议。</p></section></aside></fieldset>
      <div className="adm-workflow-actions"><span>{busy ? "正在处理…" : dirty ? "有未保存的修改" : saved?.status === "published" ? `已发布 · ${formatDate(saved.published_at)}` : saved?.status === "archived" ? "已归档" : saved ? "草稿已保存" : "填写后保存"}</span><div className="adm-actions">{!locked ? <><button type="submit" value="draft" className="adm-button adm-button-secondary" disabled={busy}><Save size={17} />保存草稿</button><button type="submit" value="preview" className="adm-button" disabled={busy}><Send size={17} />保存并预览</button></> : <button type="button" className="adm-button" disabled={busy} onClick={() => saved?.status === "published" ? setConfirmation("unpublish") : void changeState("unpublish")}>{saved?.status === "published" ? "下线后编辑" : "恢复为草稿"}</button>}</div></div>
    </form>
    {saved && saved.status !== "archived" && <button type="button" className="adm-text-link adm-danger-text adm-content-archive" disabled={busy || dirty} onClick={() => setConfirmation("archive")}><Archive size={15} />归档这条{config.name}</button>}
    <dialog ref={dialog} className="adm-preview-dialog" aria-labelledby="content-preview-title" onCancel={event => { event.preventDefault(); if (!busy) setPreviewMode(null); }}><div className="adm-preview-dialog-header"><div><h2 id="content-preview-title">{previewMode === "publish" ? `确认发布这条${config.name}？` : `${config.name}内容预览`}</h2><p>{previewMode === "publish" ? "内容已保存。请核对适用范围、操作说明与关联软件，确认后将在公开站点展示。" : dirty ? "本次预览包含尚未保存的修改。" : "以下为当前保存的内容。"}</p></div><button className="adm-icon-button" aria-label="关闭预览" type="button" disabled={busy} onClick={() => setPreviewMode(null)}><X size={20} /></button></div><div className="adm-preview-dialog-content"><ContentPreview draft={draft} kind={kind} software={software} /></div><div className="adm-preview-dialog-actions"><button type="button" className="adm-button adm-button-secondary" disabled={busy} onClick={() => setPreviewMode(null)}>{previewMode === "publish" ? "返回检查" : "继续查看"}</button>{previewMode === "publish" && <button type="button" className="adm-button" disabled={busy || dirty} onClick={publish}><CheckCircle2 size={17} />{busy ? "正在发布…" : `确认发布${config.name}`}</button>}</div></dialog>
    <ConfirmDialog open={!!confirmation} title={confirmation === "archive" ? `归档这条${config.name}？` : `下线这条${config.name}后编辑？`} busy={busy} action={confirmation === "archive" ? "确认归档" : "确认下线并编辑"} onClose={() => setConfirmation(null)} onConfirm={() => { if (confirmation) void changeState(confirmation); }}><p>{confirmation === "archive" ? "归档后，内容会从公开站点移除。已保存的文字与关联关系会保留，之后可以恢复为草稿。" : "下线后，访客将暂时无法查看这条内容。编辑并重新确认发布后才会再次公开。"}</p></ConfirmDialog>
    {unsavedDialog}
  </>;
}
