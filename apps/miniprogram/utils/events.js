// 匿名统计上报（§7 数据口径）：批量合并、失败静默丢弃，不带任何访客标识。
// 看过软件（sw_view）、看过公告（ann_view）在本机按北京时间当天去重；复制下载链接上报 dl_copy。
const api = require('./api');
const storage = require('./storage');

const PAGES = ['home', 'library', 'detail', 'announcements', 'announcement', 'search', 'me'];
const BATCH = 30;          // 接口单次最多 30 条
const DELAY = 1500;        // 合并 1.5 秒内的事件再发
const queue = [];
let timer = null;

/** 北京时间自然日，如 2026-10-18。 */
function beijingDay(now = Date.now()) {
  const d = new Date(now + 8 * 3600000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function flush() {
  if (timer) { clearTimeout(timer); timer = null; }
  if (!queue.length) return Promise.resolve();
  const batch = queue.splice(0, BATCH);
  return api.post('/station/events', {events: batch}).catch(() => { /* 统计失败不影响使用 */ }).then(() => (queue.length ? flush() : undefined));
}

function schedule() {
  if (timer) return;
  timer = setTimeout(flush, DELAY);
  if (timer && typeof timer.unref === 'function') timer.unref(); // Node 测试环境下不阻止进程退出
}

/** 加入队列；满一批立即发送，否则延迟合并。 */
function track(event, key) {
  if (!event || key === undefined || key === null || key === '') return false;
  queue.push({event, key: String(key).slice(0, 80)});
  if (queue.length >= BATCH) flush(); else schedule();
  return true;
}

/**
 * 当天去重判定（纯逻辑，便于测试）：state 为 {day, keys}。
 * 返回 {report, state}：report 表示今天第一次出现，需要上报；state 为更新后的记录。
 */
function dedupe(state, id, day) {
  const keys = state && state.day === day ? state.keys : [];
  if (keys.includes(id)) return {report: false, state: {day, keys}};
  return {report: true, state: {day, keys: [...keys, id]}};
}

function onceDaily(event, key, now) {
  if (!key) return false;
  const result = dedupe(storage.eventDays(), event + ':' + key, beijingDay(now));
  storage.setEventDays(result.state);
  return result.report ? track(event, key) : false;
}

module.exports = {
  PAGES, beijingDay, dedupe, track, flush,
  pending: () => queue.slice(),
  page: name => (PAGES.includes(name) ? track('page_view', name) : false),
  softwareView: (id, now) => onceDaily('sw_view', id, now),
  releaseView: (id, now) => onceDaily('release_view', id, now),
  announcementView: (id, now) => onceDaily('ann_view', id, now),
  downloadCopy: releaseId => track('dl_copy', releaseId),
  favorite: (id, added) => track(added ? 'fav_add' : 'fav_remove', id),
  search: (term, hit) => { const value = String(term || '').trim().slice(0, 30); return value ? track(hit ? 'search' : 'search_miss', value) : false; },
  adImpression: (placement, id) => track('ad_imp', placement + ':' + id),
  adClick: (placement, id) => track('ad_click', placement + ':' + id),
  /** 仅测试使用 */
  reset() { queue.length = 0; if (timer) { clearTimeout(timer); timer = null; } }
};
