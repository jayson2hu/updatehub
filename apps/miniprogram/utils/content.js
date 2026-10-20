// 基础格式化与数据适配：设备、分类、建议标签、日期、数量、安全链接。所有输出都是 WXML 可直接绑定的纯数据。
const { getConfig } = require('../config');

const SITE_NAME = '版本喵'; // 站点设置读取失败时的静态默认值（R-GLOBAL-01）
const DAY = 86400000;
const BEIJING = 8 * 3600000;

const platforms = [
  { id:'android', label:'安卓', name:'安卓手机', emoji:'📱' },
  { id:'ios', label:'苹果', name:'苹果手机', emoji:'🍎' },
  { id:'tv', label:'电视', name:'电视盒子', emoji:'📺' },
  { id:'desktop', label:'电脑', name:'电脑', emoji:'💻' }
];
const byId = (list, field) => list.reduce((result, item) => { result[item.id] = item[field]; return result; }, {});
const names = byId(platforms, 'name');
const labels = byId(platforms, 'label');
const emojis = byId(platforms, 'emoji');

// 软件分类（R-HOME-05 / R-LIB-01）；顺序即展示顺序，「全部」另外处理。
const categories = [
  { id:'video', label:'影视', emoji:'🎬', bg:'#FDECEC' },
  { id:'netdisk', label:'网盘', emoji:'☁️', bg:'#EAF2FF' },
  { id:'tool', label:'工具', emoji:'🧰', bg:'#FFF4E0' },
  { id:'music', label:'音乐', emoji:'🎵', bg:'#FCE8F3' },
  { id:'note', label:'笔记', emoji:'📝', bg:'#E7F7EE' },
  { id:'reading', label:'阅读', emoji:'📚', bg:'#F1ECFF' },
  { id:'browser', label:'浏览器', emoji:'🌐', bg:'#E6F6FB' },
  { id:'other', label:'其他', emoji:'🗂', bg:'#EEF1F6' }
];
const ALL_CATEGORY = { id:'all', label:'全部', emoji:'🧩', bg:'#EEF1F6' };
const categoryLabels = byId(categories, 'label');

// 公告类型
const noticeTypes = { group:'群公告', usage:'使用提醒', maintenance:'维护通知' };
const statusText = { normal:'正常使用', attention:'需要注意', unavailable:'暂时无法使用' };

// 更新建议四档（ADR-0003，UI 规范 §4.2）
const advice = {
  recommended: { label:'建议更新', icon:'✓', tone:'ok', notice:'✅ 建议更新' },
  wait: { label:'可以等等', icon:'!', tone:'warn', notice:'⏳ 可以等等，不急' },
  hold: { label:'先别更新', icon:'✕', tone:'bad', notice:'⛔ 先别更新' },
  optional: { label:'可选更新', icon:'○', tone:'opt', notice:'🔘 可选更新，按需' }
};
function adviceOf(release) { return advice[release && release.advice] ? release.advice : 'optional'; }
/** 建议标签：{text:'✓ 建议更新', tone:'ok', label:'建议更新'}，图标与文字同时出现，不只靠颜色。 */
function adviceTag(release) { const meta = advice[adviceOf(release)]; return { text: meta.icon + ' ' + meta.label, tone: meta.tone, label: meta.label }; }

function time(value) { const t = value ? new Date(value).getTime() : NaN; return Number.isFinite(t) ? t : 0; }
function beijing(value) { return new Date(time(value) + BEIJING); }
/** 北京时间当天 0 点对应的时间戳。 */
function dayStart(value) { const d = beijing(value); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - BEIJING; }
function dayKey(value) { const d = beijing(value); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`; }

/** 2026.10.11（保留旧格式，用于版本选择等需要年份的地方） */
function date(value) { if (!value) return '尚未发布'; if (!time(value)) return '日期待确认'; const d = beijing(value); return `${d.getUTCFullYear()}.${String(d.getUTCMonth() + 1).padStart(2, '0')}.${String(d.getUTCDate()).padStart(2, '0')}`; }
/** 10月16日 */
function shortDate(value) { if (!time(value)) return ''; const d = beijing(value); return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`; }
/** 日期分组标题：10月16日 · 今天 / 10月15日 · 昨天 / 10月14日 */
function dayLabel(value, now = Date.now()) {
  const diff = Math.round((dayStart(now) - dayStart(value)) / DAY);
  return shortDate(value) + (diff === 0 ? ' · 今天' : diff === 1 ? ' · 昨天' : '');
}
/** 数量：< 1 万千分位，≥ 1 万显示 1.2万（§7） */
function formatCount(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n >= 10000) return (Math.floor(n / 1000) / 10).toString().replace(/\.0$/, '') + '万';
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function ended(n, now = Date.now()) { return Boolean(n.expired || (n.expires_at && time(n.expires_at) <= now)); }
function safeUrl(value) { if (typeof value !== 'string' || !/^https?:\/\//i.test(value) || /[\s<>"\x00-\x1f]/.test(value)) return ''; const hostPart = value.replace(/^https?:\/\//i, '').split('/')[0]; if (!hostPart || hostPart.includes('@')) return ''; return value; }
function host(value) { return safeUrl(value) ? value.replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./, '') : ''; }
function asset(src) { if (!src) return ''; if (safeUrl(src)) return src; if (!src.startsWith('/')) return ''; return getConfig().apiBase.replace(/\/api\/v1\/?$/, '') + src; }

function visibleSoftware(data) { return (data.software || []).filter(s => s.published !== false); }
function visibleReleases(data) { return (data.releases || []).filter(r => r.published !== false); }
function sortReleases(list) { return list.slice().sort((a, b) => (b.published_at || '').localeCompare(a.published_at || '')); }

function appItem(s) {
  return {...s, icon: asset(s.icon_url), devices: (s.platforms || []).map(p => labels[p]).filter(Boolean).join(' / '),
    deviceIcons: platforms.filter(p => (s.platforms || []).includes(p.id)).map(p => p.emoji).join(' '),
    categoryText: categoryLabels[s.category] || '其他', statusText: statusText[s.status] || statusText.normal};
}
function releaseState(s, r) {
  const status = s.status === 'unavailable' || r?.status === 'unavailable' ? 'unavailable' : s.status === 'attention' || r?.status === 'attention' ? 'attention' : 'normal';
  return {status, statusText: statusText[status], reason: s.status === status ? s.status_reason : r?.status_reason || s.status_reason || ''};
}
function releaseItem(r, s) { return {...r, software: s, name: s.name, slug: s.slug, icon: asset(s.icon_url), color: s.color, platformName: names[r.platform], date: date(r.published_at), ...releaseState(s, r)}; }

/** 公告卡片数据（R-ANN-02）：色条 tone、类型标签 tone、置顶、已结束。important 与 urgent 都按「重要」展示。 */
function announcement(n, now = Date.now()) {
  const isEnded = ended(n, now);
  const important = n.importance === 'important' || n.importance === 'urgent';
  const tone = isEnded ? 'ended' : important ? 'imp' : n.category === 'usage' ? 'tip' : 'brand';
  return {...n, date: date(n.published_at), shortDate: shortDate(n.published_at), expiresText: n.expires_at ? shortDate(n.expires_at) : '',
    categoryText: noticeTypes[n.category] || '群公告', ended: isEnded, important, activePinned: Boolean(n.pinned && !isEnded), tone,
    typeTone: important ? 'bad' : n.category === 'usage' ? 'gold' : 'brand',
    paragraphs: (n.body || '').split('\n').map(line => line.trim()).filter(Boolean), images: (n.images || []).map(asset).filter(Boolean),
    links: (n.links || []).filter(l => safeUrl(l.url))};
}
/** 列表排序：有效置顶在前，其余按发布时间倒序，已结束排在未结束之后（R-ANN-01）。 */
function sortAnnouncements(list) {
  return list.slice().sort((a, b) => Number(a.ended) - Number(b.ended) || Number(b.activePinned) - Number(a.activePinned) || (b.published_at || '').localeCompare(a.published_at || ''));
}
function pinned(data) { const order = { urgent:3, important:2, normal:1 }; return (data.announcements || []).filter(n => n.published !== false).map(n => announcement(n)).filter(n => n.activePinned).sort((a, b) => (order[b.importance] || 0) - (order[a.importance] || 0))[0] || null; }

function detailRoute(slug, platform, release) { return '/pages/detail/index?slug=' + encodeURIComponent(slug) + (platform ? '&platform=' + encodeURIComponent(platform) : '') + (release ? '&release=' + encodeURIComponent(release) : ''); }
function webLink(path) { return getConfig().websiteBase.replace(/\/$/, '') + path; }
function siteName(settings) { return (settings && typeof settings.site_name === 'string' && settings.site_name.trim()) || SITE_NAME; }

module.exports = {
  SITE_NAME, platforms, names, labels, emojis, categories, ALL_CATEGORY, categoryLabels, noticeTypes, statusText, advice,
  adviceOf, adviceTag, time, dayStart, dayKey, date, shortDate, dayLabel, formatCount, ended, safeUrl, host, asset,
  visibleSoftware, visibleReleases, sortReleases, appItem, releaseItem, releaseState, announcement, sortAnnouncements, pinned,
  detailRoute, webLink, siteName
};
