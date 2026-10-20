// 本机存储：收藏、红点、最近看过、常用设备、反馈、搜索历史、想要的软件、同步码等。
// 只通过 utils/platform 访问 wx / xhs storage；存储不可用（隐私模式、配额满）时退回内存，页面照常可用。
const wx = require('./platform');

const KEYS = {
  favorites: 'bm.favorites',     // string[]：收藏的软件 id，最新收藏在前
  seen: 'bm.seen',               // {softwareId: ISO 时间}：上次查看时该软件最新版本的发布时间（红点判定）
  recent: 'bm.recent',           // string[]：最近看过的软件 id，最多 6 个
  device: 'bm.device',           // '' | android | ios | tv | desktop：常用设备，'' 为自动识别
  feedback: 'bm.feedback',       // {releaseId: {verdict, kind, softwareId, name, version, platform, at}}
  searches: 'bm.searches',       // string[]：搜索历史，最多 10 条
  wishes: 'bm.wishes',           // [{name, platforms, note, votes, status, at}]
  remind: 'bm.remind',           // boolean：是否显示收藏有新版的红点与角标，默认开
  sync: 'bm.sync',               // {code, expires_at, count}：最近一次生成的同步码
  siteName: 'bm.siteName',       // string：最近一次读取到的站名，冷启动时先显示
  eventDays: 'bm.eventDays'      // {day, keys}：按北京时间当天去重的统计事件
};
const LIMITS = { recent: 6, searches: 10, wishes: 50, feedback: 200, eventKeys: 500 };
const PLATFORMS = ['android', 'ios', 'tv', 'desktop'];
const memory = {};

function read(key, fallback, valid) {
  let value;
  try { value = wx.getStorageSync(key); } catch (_) { value = undefined; }
  if (value === undefined || value === null || value === '') value = memory[key];
  if (value === undefined || value === null || value === '') return fallback;
  return valid && !valid(value) ? fallback : value;
}
function write(key, value) {
  memory[key] = value;
  try { wx.setStorageSync(key, value); } catch (_) { /* 已写入内存，本次会话内仍然有效。 */ }
  return value;
}
const isList = value => Array.isArray(value);
const isMap = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const strings = value => (Array.isArray(value) ? value.filter(item => typeof item === 'string' && item) : []);
const time = value => { const t = value ? new Date(value).getTime() : NaN; return Number.isFinite(t) ? t : 0; };

/** 红点判定（R-GLOBAL-08）：该软件最新发布时间晚于上次查看时记录的时间才算有新版。没有记录时不提醒。 */
function hasUpdate(latestAt, seenAt) {
  const latest = time(latestAt);
  const seen = time(seenAt);
  return Boolean(latest && seen && latest > seen);
}

// ---- 收藏与已读 ----
function favorites() { return strings(read(KEYS.favorites, [], isList)); }
function isFavorite(id) { return favorites().includes(id); }
function seen() { return read(KEYS.seen, {}, isMap); }
function markSeen(id, latestAt) {
  if (!id) return;
  const map = {...seen()};
  map[id] = latestAt || new Date().toISOString();
  write(KEYS.seen, map);
}
/** 全部已读：latestMap 为 {softwareId: 最新发布时间}。 */
function markAllSeen(latestMap) { write(KEYS.seen, {...seen(), ...latestMap}); }
/** 切换收藏；新收藏立即视为已读。返回切换后的状态。 */
function toggleFavorite(id, latestAt) {
  const list = favorites();
  if (list.includes(id)) { write(KEYS.favorites, list.filter(item => item !== id)); return false; }
  write(KEYS.favorites, [id, ...list]);
  markSeen(id, latestAt);
  return true;
}
/** 同步码恢复：与本机收藏合并（不覆盖），返回新增的 id。 */
function mergeFavorites(ids, latestMap = {}) {
  const list = favorites();
  const added = strings(ids).filter((id, index, all) => !list.includes(id) && all.indexOf(id) === index);
  if (!added.length) return [];
  write(KEYS.favorites, [...list, ...added]);
  const map = {...seen()};
  added.forEach(id => { map[id] = latestMap[id] || new Date().toISOString(); });
  write(KEYS.seen, map);
  return added;
}

// ---- 更新提醒开关 ----
function remind() { return read(KEYS.remind, true, value => typeof value === 'boolean'); }
function setRemind(value) { return write(KEYS.remind, Boolean(value)); }

// ---- 最近看过 ----
function recent() { return strings(read(KEYS.recent, [], isList)).slice(0, LIMITS.recent); }
function pushRecent(id) { if (id) write(KEYS.recent, [id, ...recent().filter(item => item !== id)].slice(0, LIMITS.recent)); }
function clearRecent() { write(KEYS.recent, []); }

// ---- 常用设备 ----
function device() { const value = read(KEYS.device, '', value => typeof value === 'string'); return PLATFORMS.includes(value) ? value : ''; }
function setDevice(value) { return write(KEYS.device, PLATFORMS.includes(value) ? value : ''); }

// ---- 反馈记录（每台设备每个版本只保留一票） ----
function feedback() { return read(KEYS.feedback, {}, isMap); }
function setFeedback(releaseId, record) {
  const map = {...feedback()};
  if (record) map[releaseId] = {...record, at: record.at || new Date().toISOString()};
  else delete map[releaseId];
  const trimmed = Object.entries(map).sort((a, b) => time(b[1].at) - time(a[1].at)).slice(0, LIMITS.feedback);
  write(KEYS.feedback, trimmed.reduce((result, [key, value]) => { result[key] = value; return result; }, {}));
}
function feedbackList() { return Object.entries(feedback()).map(([releaseId, value]) => ({releaseId, ...value})).sort((a, b) => time(b.at) - time(a.at)); }

// ---- 搜索历史 ----
function searches() { return strings(read(KEYS.searches, [], isList)).slice(0, LIMITS.searches); }
function pushSearch(term) {
  const value = String(term || '').trim().slice(0, 30);
  if (value) write(KEYS.searches, [value, ...searches().filter(item => item !== value)].slice(0, LIMITS.searches));
}
function clearSearches() { write(KEYS.searches, []); }

// ---- 想要的软件 ----
function wishKey(name) { return String(name || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '').replace(/(?:电视版|tv版|软件|app)$/, ''); }
function wishes() { return read(KEYS.wishes, [], isList).filter(item => item && typeof item.name === 'string'); }
function hasWish(name) { const key = wishKey(name); return wishes().some(item => wishKey(item.name) === key); }
function addWish(record) { write(KEYS.wishes, [{...record, at: record.at || new Date().toISOString()}, ...wishes()].slice(0, LIMITS.wishes)); }

function updateWishes(updates) {
  const byId = new Map(updates.map(item => [item.id,item]));
  write(KEYS.wishes, wishes().map(item => ({...item,...(byId.get(item.id) || {})})));
}
// ---- 同步码 ----
function syncCode() { const value = read(KEYS.sync, null, isMap); return value && typeof value.code === 'string' ? value : null; }
function setSyncCode(value) { return write(KEYS.sync, value); }

// ---- 站名缓存 ----
function siteName(fallback = '版本喵') { const value = read(KEYS.siteName, '', value => typeof value === 'string'); return value || fallback; }
function setSiteName(value) { if (value) write(KEYS.siteName, String(value)); }

// ---- 统计去重 ----
function eventDays() { const value = read(KEYS.eventDays, null, isMap); return value && Array.isArray(value.keys) ? value : {day: '', keys: []}; }
function setEventDays(value) { write(KEYS.eventDays, {day: value.day, keys: strings(value.keys).slice(-LIMITS.eventKeys)}); }

/** 仅测试使用：清空内存与本地存储。 */
function reset() { Object.values(KEYS).forEach(key => { delete memory[key]; try { wx.removeStorageSync(key); } catch (_) { /* ignore */ } }); }

module.exports = {
  KEYS, LIMITS, hasUpdate,
  favorites, isFavorite, toggleFavorite, mergeFavorites, seen, markSeen, markAllSeen,
  remind, setRemind, recent, pushRecent, clearRecent, device, setDevice,
  feedback, feedbackList, setFeedback, searches, pushSearch, clearSearches,
  wishKey, wishes, hasWish, addWish, updateWishes, syncCode, setSyncCode, siteName, setSiteName,
  eventDays, setEventDays, reset
};
