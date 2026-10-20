// Pure view helpers for the v4 visitor site (版本喵). Safe on server and client:
// no React, no browser globals. Time-dependent helpers take `now` explicitly so
// server and client renders agree during hydration.
import type { Advice, Announcement, Category, ChangeKind, DownloadLink, IssueKind, Platform, Release, Software, StationData } from './station-types';
import { allPlatforms, isExpired, safeLink } from './station';

export const TZ = 'Asia/Shanghai';

/* ---------- 名称与图标 ---------- */
export const platformShort: Record<Platform, string> = { android: '安卓', ios: '苹果', tv: '电视', desktop: '电脑' };
export const platformFull: Record<Platform, string> = { android: '安卓手机', ios: '苹果手机', tv: '电视盒子', desktop: '电脑' };
export const platformEmoji: Record<Platform, string> = { android: '📱', ios: '🍎', tv: '📺', desktop: '💻' };
export const isPlatform = (value: unknown): value is Platform => typeof value === 'string' && (allPlatforms as string[]).includes(value);

export const categoryOrder: Category[] = ['video', 'netdisk', 'tool', 'music', 'note', 'reading', 'browser', 'other'];
export const categoryMeta: Record<Category, { label: string; icon: string; bg: string }> = {
  video: { label: '影视', icon: '🎬', bg: '#FDECEC' },
  netdisk: { label: '网盘', icon: '☁️', bg: '#EAF2FF' },
  tool: { label: '工具', icon: '🧰', bg: '#FFF4E0' },
  music: { label: '音乐', icon: '🎵', bg: '#FCE8F3' },
  note: { label: '笔记', icon: '📝', bg: '#E7F7EE' },
  reading: { label: '阅读', icon: '📚', bg: '#F1ECFF' },
  browser: { label: '浏览器', icon: '🌐', bg: '#E6F6FB' },
  other: { label: '其他', icon: '🗂', bg: '#EEF1F6' },
};
export const isCategory = (value: unknown): value is Category => typeof value === 'string' && (categoryOrder as string[]).includes(value);

export type Tone = 'ok' | 'warn' | 'bad' | 'opt';
export const adviceMeta: Record<Advice, { label: string; icon: string; tone: Tone; notice: string }> = {
  recommended: { label: '建议更新', icon: '✓', tone: 'ok', notice: '✅ 建议更新' },
  wait: { label: '可以等等', icon: '!', tone: 'warn', notice: '⏳ 可以等等，不急' },
  hold: { label: '先别更新', icon: '✕', tone: 'bad', notice: '⛔ 先别更新' },
  optional: { label: '可选更新', icon: '○', tone: 'opt', notice: '🔘 可选更新，按需' },
};
export const changeKindOrder: ChangeKind[] = ['added', 'fixed', 'improved', 'known_issue'];
export const changeKindMeta: Record<ChangeKind, { label: string; cls: string }> = {
  added: { label: '新增', cls: 'added' }, fixed: { label: '修复', cls: 'fixed' }, improved: { label: '优化', cls: 'improved' }, known_issue: { label: '已知问题', cls: 'known' },
};
export const issueKinds: [IssueKind, string][] = [['crash', '闪退'], ['install', '装不上'], ['download', '下载不了'], ['login', '登录不了'], ['link', '链接失效'], ['other', '其他']];
export const announcementTypes: Record<Announcement['category'], string> = { group: '群公告', usage: '使用提醒', maintenance: '维护通知' };
export const wishStatusLabel = (status: string) => status === 'added' ? '已收录' : status === 'rejected' || status === 'ignored' ? '暂不收录' : '处理中';

/* 设备默认安装提示（R-DETAIL-14 设计稿文案，仅在版本没有填写安装提醒时显示）。 */
export const defaultInstallTip: Record<Platform, string> = {
  android: '不要在小红书里下载，请先在浏览器打开，否则可能下载失败。',
  ios: '苹果手机只能从 App Store 安装，本站不提供其他安装方式。',
  tv: '电视第一次装软件时，需要在「设置 → 安全」里打开“允许安装未知来源”。',
  desktop: '安装路径尽量不要有中文。',
};

/* ---------- 日期与数字（北京时间） ---------- */
const partsFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' });
function shParts(value: string | number | Date) {
  const parts = Object.fromEntries(partsFormatter.formatToParts(new Date(value)).map(p => [p.type, p.value]));
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day), weekday: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(parts.weekday) };
}
const validDate = (value?: string | number | null) => value !== null && value !== undefined && value !== '' && !Number.isNaN(new Date(value).getTime());

/** 北京时间日期键 YYYY-MM-DD，用于分组和"今天"判断。 */
export function dayKey(value: string | number | Date) { const { y, m, d } = shParts(value); return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
/** 10月16日 */
export function monthDay(value?: string | null) {
  if (!validDate(value)) return '';
  // release_date 是纯日期，直接取字面值，避免时区换算到前一天。
  const plain = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value!);
  if (plain) return `${Number(plain[2])}月${Number(plain[3])}日`;
  const { m, d } = shParts(value!); return `${m}月${d}日`;
}
export function yearMonth(value?: string | null) { if (!validDate(value)) return ''; const { y, m } = shParts(value!); return `${y}年${m}月`; }
export function dayHeading(key: string, now: number) {
  const [, m, d] = key.split('-').map(Number);
  const today = dayKey(now), yesterday = dayKey(now - 86400000);
  return `${m}月${d}日${key === today ? ' · 今天' : key === yesterday ? ' · 昨天' : ''}`;
}
/** 本周（周一 00:00 至周日 24:00，北京时间）的起止和"M月第N周"。 */
export function weekInfo(now: number) {
  const { weekday } = shParts(now);
  const todayStart = new Date(`${dayKey(now)}T00:00:00+08:00`).getTime();
  const start = todayStart - weekday * 86400000;
  const monday = shParts(start);
  return { start, end: start + 7 * 86400000, label: `${monday.m}月第${Math.floor((monday.d - 1) / 7) + 1}周` };
}
/** < 1 万显示千分位，≥ 1 万显示「1.2万」。 */
export function formatCount(n: number) {
  if (!Number.isFinite(n) || n < 0) return '0';
  if (n >= 10000) return `${(n / 10000).toFixed(1).replace(/\.0$/, '')}万`;
  return Math.round(n).toLocaleString('en-US');
}

/* ---------- 版本 ---------- */
export const byPublishedDesc = (a: Release, b: Release) => (b.published_at || '').localeCompare(a.published_at || '');
export function releasesOf(releases: Release[], softwareId: string, platform?: Platform) {
  return releases.filter(r => r.software_id === softwareId && r.published !== false && (!platform || r.platform === platform)).sort(byPublishedDesc);
}
/** 每款软件最新发布的版本（任一设备）。 */
export function latestBySoftware(releases: Release[]) {
  const map = new Map<string, Release>();
  for (const r of [...releases].sort(byPublishedDesc)) if (!map.has(r.software_id)) map.set(r.software_id, r);
  return map;
}
/** 红点判定用：每款软件最新版本的发布时间（R-GLOBAL-08）。 */
export function latestMarkers(releases: Release[]) {
  const out: Record<string, string> = {};
  latestBySoftware(releases).forEach((r, id) => { if (r.published_at) out[id] = r.published_at; });
  return out;
}
export function feedbackRate(r?: Pick<Release, 'feedback_ok' | 'feedback_issue'>, extra?: { ok?: number; issue?: number }) {
  const ok = (r?.feedback_ok || 0) + (extra?.ok || 0), issue = (r?.feedback_issue || 0) + (extra?.issue || 0), total = ok + issue;
  return { ok, issue, total, pct: total ? Math.round((ok / total) * 100) : 0, enough: total >= 5 };
}
const usable = (l: DownloadLink) => l.is_active !== false && !!safeLink(l.url);
/** 官方入口：kind=official 优先；旧数据没有 kind 时取 is_primary 或第一条。 */
export function officialLink(r?: Release) {
  const links = (r?.links || []).filter(usable);
  return links.find(l => l.kind === 'official' && l.is_primary) || links.find(l => l.kind === 'official') || links.find(l => !l.kind && l.is_primary) || links.find(l => !l.kind);
}
/** All remaining usable entries, including a second official mirror. */
export function backupLinks(r?: Release) { const main = officialLink(r); return (r?.links || []).filter(l => usable(l) && l !== main); }
export function hostOf(url?: string) { try { return url ? new URL(url).hostname.replace(/^www\./, '') : ''; } catch { return ''; } }
export function softwarePath(slug: string, platform?: Platform, releaseId?: string) {
  const q = new URLSearchParams();
  if (platform) q.set('platform', platform);
  if (releaseId) q.set('release', releaseId);
  const s = q.toString();
  return `/software/${encodeURIComponent(slug)}${s ? `?${s}` : ''}`;
}
export function detectPlatform(ua: string): Platform { return /iPhone|iPad|iPod/i.test(ua) ? 'ios' : /Android/i.test(ua) ? 'android' : 'desktop'; }
export type InApp = 'xhs' | 'wechat' | null;
export function detectInApp(ua: string): InApp { return /xiaohongshu|discover/i.test(ua) ? 'xhs' : /MicroMessenger/i.test(ua) ? 'wechat' : null; }

/* ---------- 首页信息流 ---------- */
export interface FeedEntry { key: string; software: Software; release: Release; platforms: Platform[]; releaseIds: string[]; day: string; /** 是否为该设备当前版本（否则链接带 release 参数）。 */ current: boolean }
/**
 * 同一软件、同一天（北京时间）、同一版本号且建议相同的多设备版本合并为一条（R-HOME-06）。
 * 建议不同时不合并，避免把「先别更新」藏进「建议更新」的卡片里。
 */
export function buildFeed(data: Pick<StationData, 'software' | 'releases'>): FeedEntry[] {
  const soft = new Map(data.software.filter(s => s.published !== false).map(s => [s.id, s]));
  const map = new Map<string, FeedEntry>();
  const seenPlatform = new Set<string>();
  for (const r of [...data.releases].filter(r => r.published_at && r.published !== false).sort(byPublishedDesc)) {
    const s = soft.get(r.software_id); if (!s) continue;
    const current = !seenPlatform.has(`${s.id}|${r.platform}`);
    seenPlatform.add(`${s.id}|${r.platform}`);
    const day = dayKey(r.published_at!);
    const key = `${s.id}|${day}|${r.version}|${r.advice}`;
    const entry = map.get(key);
    if (entry) { if (!entry.platforms.includes(r.platform)) { entry.platforms.push(r.platform); entry.releaseIds.push(r.id); } }
    else map.set(key, { key, software: s, release: r, platforms: [r.platform], releaseIds: [r.id], day, current });
  }
  return [...map.values()].map(e => ({ ...e, platforms: allPlatforms.filter(p => e.platforms.includes(p)) }));
}
export function weekSummary(feed: FeedEntry[], announcements: Announcement[], now: number) {
  const { start, end, label } = weekInfo(now);
  const inWeek = feed.filter(e => { const t = new Date(e.release.published_at!).getTime(); return t >= start && t < end; });
  return {
    label, count: inWeek.length,
    recommended: inWeek.filter(e => e.release.advice === 'recommended').length,
    hold: inWeek.filter(e => e.release.advice === 'hold').length,
    important: announcements.filter(n => !isExpired(n, now) && n.importance !== 'normal').length,
  };
}

/* ---------- 公告 ---------- */
export const isPinnedNow = (n: Announcement, now: number) => !isExpired(n, now) && (n.effective_pinned ?? n.pinned);
export function annTone(n: Announcement, now: number) { return isExpired(n, now) ? 'ended' : n.importance !== 'normal' ? 'imp' : n.category === 'usage' ? 'tip' : 'brand'; }
export function annTypeTone(n: Announcement) { return n.importance !== 'normal' ? 'bad' : n.category === 'usage' ? 'gold' : 'brand'; }
/** 有效置顶在前，其余按发布时间倒序；已结束排在最后（R-ANN-01）。 */
export function sortAnnouncements(list: Announcement[], now: number) {
  const rank = (n: Announcement) => isExpired(n, now) ? 2 : isPinnedNow(n, now) ? 0 : 1;
  return [...list].filter(n => n.published !== false).sort((a, b) => rank(a) - rank(b) || (b.published_at || '').localeCompare(a.published_at || ''));
}

/* ---------- 搜索 ---------- */
/** 全半角、大小写归一：逐字符 NFKC + 小写，并记录到原文的下标映射，用于高亮。 */
function normalizeWithMap(text: string) {
  let out = ''; const map: number[] = [];
  Array.from(text).reduce((offset, ch) => {
    const n = ch.normalize('NFKC').toLowerCase();
    for (let i = 0; i < n.length; i++) map.push(offset);
    out += n; return offset + ch.length;
  }, 0);
  map.push(text.length);
  return { out, map };
}
export const normalizeQuery = (q: string) => q.normalize('NFKC').toLowerCase().trim().replace(/\s+/g, ' ');
/** 返回原文中命中关键词的区间 [start, end)。 */
export function findRanges(text: string, query: string): [number, number][] {
  const q = normalizeQuery(query); if (!q || !text) return [];
  const { out, map } = normalizeWithMap(text);
  const ranges: [number, number][] = [];
  for (let i = out.indexOf(q); i >= 0; i = out.indexOf(q, i + q.length)) ranges.push([map[i], map[i + q.length]]);
  return ranges;
}
export const includesQuery = (text: string, query: string) => findRanges(text, query).length > 0;
export interface SoftwareHit { software: Software; via: string }
/** 名称、别名、标签、简介、分类名包含匹配；名称命中排最前（R-SEARCH-03）。 */
export function searchSoftware(list: Software[], query: string): SoftwareHit[] {
  const hits: (SoftwareHit & { score: number })[] = [];
  for (const s of list) {
    if (s.published === false) continue;
    const alias = s.aliases.find(a => includesQuery(a, query));
    const tag = s.tags.find(t => includesQuery(t, query));
    const score = includesQuery(s.name, query) ? 0 : alias ? 1 : tag ? 2 : includesQuery(s.summary, query) ? 3 : includesQuery(categoryMeta[s.category]?.label || '', query) ? 4 : includesQuery(s.description, query) ? 5 : -1;
    if (score >= 0) hits.push({ software: s, score, via: score === 1 ? `别名：${alias}` : score === 2 ? `标签：${tag}` : '' });
  }
  return hits.sort((a, b) => a.score - b.score).map(({ software, via }) => ({ software, via }));
}
export function searchAnnouncements(list: Announcement[], query: string) {
  return list.filter(n => n.published !== false && (includesQuery(n.title, query) || includesQuery(n.summary, query) || includesQuery(n.body, query)));
}

/* ---------- 群通知文案（UI 规范 §7.4） ---------- */
export function noticeText({ siteName, software, release, stable, url, tip }: { siteName: string; software: Software; release: Release; stable?: Release; url: string; tip?: string }) {
  const lines = [`【${siteName}】${software.name} ${release.version} 更新了`];
  if (release.summary) lines.push(release.summary);
  lines.push(adviceMeta[release.advice].notice);
  if (release.advice === 'hold' && stable) lines.push(`👉 需要的话先装稳定版 ${stable.version}`);
  lines.push('', '下载和安装方法 👇', url, '（小红书里打不开就点右上角···，选“在浏览器打开”）');
  if (tip?.trim()) lines.push(tip.trim());
  return lines.join('\n');
}
