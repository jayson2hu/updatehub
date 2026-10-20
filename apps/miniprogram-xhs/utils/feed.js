// 首页、软件库、我的页共用的聚合计算（R-HOME-01/04/05/06/07/08，R-LIB-01~03，R-ME-02）。
const c = require('./content');
const storage = require('./storage');
const { feedbackSummary } = require('./advice');
const WEEK = 7 * 86400000;
const PAGE_SIZE = 20;
/** 本周（北京时间周一 0 点起）与「{M}月第{N}周」，N 以周一所在月份计。 */
function weekInfo(now = Date.now()) {
    const today = c.dayStart(now);
    const weekday = (new Date(today + 8 * 3600000).getUTCDay() + 6) % 7; // 周一 = 0
    const start = today - weekday * 86400000;
    const monday = new Date(start + 8 * 3600000);
    return { start, end: start + WEEK, label: `${monday.getUTCMonth() + 1}月第${Math.floor((monday.getUTCDate() - 1) / 7) + 1}周` };
}
/** 每个软件的最新版本（任一设备）与各设备当前版本。 */
function latestIndex(data) {
    const index = {};
    c.sortReleases(c.visibleReleases(data)).forEach(r => {
        const item = index[r.software_id] || (index[r.software_id] = { latest: r, byPlatform: {} });
        if (!item.byPlatform[r.platform])
            item.byPlatform[r.platform] = r;
    });
    return index;
}
function latestMap(data) { const index = latestIndex(data); return Object.keys(index).reduce((map, id) => { map[id] = index[id].latest.published_at; return map; }, {}); }
/** 信息流卡片：同一软件同一天同一版本号的多设备版本合并为一张（R-HOME-06）。 */
function feedCards(data, now = Date.now()) {
    const software = c.visibleSoftware(data).reduce((map, s) => { map[s.id] = s; return map; }, {});
    const cards = [];
    const byKey = {};
    c.sortReleases(c.visibleReleases(data)).forEach(r => {
        const s = software[r.software_id];
        if (!s)
            return;
        const key = [r.software_id, r.version, c.dayKey(r.published_at)].join('|');
        let card = byKey[key];
        if (!card) {
            card = byKey[key] = { key, isDemo: Boolean(s.is_demo), softwareId: s.id, slug: s.slug, name: s.name, icon: c.asset(s.icon_url), color: s.color, version: r.version,
                previous: r.previous_version || '', summary: r.summary || '', tag: c.adviceTag(r), advice: c.adviceOf(r), releaseId: r.id, platform: r.platform,
                platforms: [], publishedAt: r.published_at, day: c.dayKey(r.published_at), dayLabel: c.dayLabel(r.published_at, now), ok: 0, issue: 0,
                viewsText: c.formatCount(s.view_count) + ' 人看过' };
            cards.push(card);
        }
        if (!card.platforms.some(p => p.id === r.platform))
            card.platforms.push({ id: r.platform, text: c.emojis[r.platform] + ' ' + c.labels[r.platform] });
        card.ok += Number(r.feedback_ok) || 0;
        card.issue += Number(r.feedback_issue) || 0;
    });
    cards.forEach(card => { card.platformIds = card.platforms.map(p => p.id); card.rateText = feedbackSummary(card.ok, card.issue).rateText; });
    return cards;
}
/** 本周概览（R-HOME-01）：版本条目按合并后的卡片计；重要公告 = 未结束且 important/urgent。 */
function weekStats(data, now = Date.now()) {
    const week = weekInfo(now);
    const cards = feedCards(data, now).filter(card => { const t = c.time(card.publishedAt); return t >= week.start && t < week.end; });
    const notices = (data.announcements || []).filter(n => n.published !== false && !c.ended(n, now) && (n.importance === 'important' || n.importance === 'urgent'));
    const total = cards.length;
    const pills = [];
    const recommended = cards.filter(card => card.advice === 'recommended').length;
    const hold = cards.filter(card => card.advice === 'hold').length;
    if (total && recommended)
        pills.push(`✓ ${recommended} 个建议更新`);
    if (total && hold)
        pills.push(`✕ ${hold} 个先别更新`);
    if (total && notices.length)
        pills.push(`📢 ${notices.length} 条重要公告`);
    return { label: week.label, total, recommended, hold, important: notices.length, title: total ? `本周 ${total} 个软件更新` : '本周暂无软件更新', pills };
}
/** 收藏状态：每个收藏软件的最新版本与是否有新版（R-GLOBAL-08）。remind 关闭时一律不提示。 */
function favoriteStates(data, favorites = storage.favorites(), seen = storage.seen(), remind = storage.remind()) {
    const software = c.visibleSoftware(data).reduce((map, s) => { map[s.id] = s; return map; }, {});
    const index = latestIndex(data);
    return favorites.filter(id => software[id]).map(id => {
        const s = software[id];
        const latest = index[id] && index[id].latest;
        return { id, slug: s.slug, name: s.name, icon: c.asset(s.icon_url), color: s.color, version: latest ? latest.version : '', previous: latest ? latest.previous_version || '' : '',
            date: latest ? c.shortDate(latest.published_at) : '', tag: latest ? c.adviceTag(latest) : null, platform: latest ? latest.platform : '',
            latestAt: latest ? latest.published_at : '', isNew: Boolean(remind && latest && storage.hasUpdate(latest.published_at, seen[id])) };
    });
}
function updateCount(data) { return favoriteStates(data).filter(item => item.isNew).length; }
/**
 * 首页信息流：有新版的收藏提到最前（组标题「★ 你收藏的软件有新版本」），其余按日期分组；
 * 第 3 张卡片后标记广告位；只返回前 limit 张。WXML 中逐项判断 heading / adAfter。
 */
function feedItems(data, { platform = 'all', limit = PAGE_SIZE, now = Date.now() } = {}) {
    const fav = favoriteStates(data);
    const seen = storage.seen();
    const newIds = fav.filter(item => item.isNew).map(item => item.id);
    const cards = feedCards(data, now).filter(card => platform === 'all' || card.platformIds.includes(platform));
    const favCards = [];
    const rest = [];
    const favoriteIds = fav.map(item => item.id);
    cards.forEach(card => {
        const highlight = newIds.includes(card.softwareId) && storage.hasUpdate(card.publishedAt, seen[card.softwareId]);
        card.favorite = favoriteIds.includes(card.softwareId);
        card.isNew = highlight;
        (highlight && !favCards.some(item => item.softwareId === card.softwareId) ? favCards : rest).push(card);
    });
    let previous = '';
    const ordered = favCards.map((card, index) => (Object.assign(Object.assign({}, card), { heading: index === 0 ? '★ 你收藏的软件有新版本' : '', headingFav: index === 0 })))
        .concat(rest.map(card => { const heading = card.day !== previous ? card.dayLabel : ''; previous = card.day; return Object.assign(Object.assign({}, card), { heading, headingFav: false }); }));
    const items = ordered.slice(0, limit).map((card, index) => (Object.assign(Object.assign({}, card), { adAfter: index === 2 })));
    return { items, total: ordered.length, hasMore: ordered.length > limit };
}
/** 本周热门（R-HOME-08）：近 7 天看过人数前 5；没有数据时隐藏。 */
function hotList(data, limit = 5) {
    const stats = data.stats || {};
    const views = stats.software || {};
    const software = c.visibleSoftware(data).reduce((map, s) => { map[s.id] = s; return map; }, {});
    let ids = Array.isArray(stats.hot_software) ? stats.hot_software.filter(id => software[id]) : [];
    if (!ids.length)
        ids = Object.keys(views).filter(id => software[id] && (views[id].views_7d || 0) > 0).sort((a, b) => views[b].views_7d - views[a].views_7d);
    const index = latestIndex(data);
    return ids.slice(0, limit).map((id, i) => {
        const s = software[id];
        const latest = index[id] && index[id].latest;
        return { id, slug: s.slug, rank: i + 1, name: s.name, icon: c.asset(s.icon_url), color: s.color, viewsText: c.formatCount((views[id] && views[id].views_7d) || 0) + ' 人看过', tag: latest ? c.adviceTag(latest) : null };
    });
}
/** 分类宫格（R-HOME-05）：只显示有已上架软件的分类，「全部」放最后。 */
function categoryGrid(data) {
    const used = new Set(c.visibleSoftware(data).map(s => s.category || 'other'));
    return c.categories.filter(cat => used.has(cat.id)).concat([c.ALL_CATEGORY]);
}
/** 软件库 chips：「全部」在前，其余全部分类。 */
function categoryChips() { return [c.ALL_CATEGORY].concat(c.categories).map(cat => (Object.assign(Object.assign({}, cat), { text: cat.emoji + ' ' + cat.label }))); }
/** 软件库（R-LIB-01~03）：sort = recent（最近更新）| popular（最多人看）。 */
function libraryList(data, { category = 'all', sort = 'recent', favorites = storage.favorites() } = {}) {
    const index = latestIndex(data);
    const list = c.visibleSoftware(data).filter(s => category === 'all' || (s.category || 'other') === category).map(s => {
        const latest = index[s.id] && index[s.id].latest;
        const item = c.appItem(s);
        return { id: s.id, slug: s.slug, name: s.name, summary: s.summary || '', icon: item.icon, color: s.color, deviceIcons: item.deviceIcons, devices: item.devices,
            version: latest ? latest.version : '', tag: latest ? c.adviceTag(latest) : null, latestAt: latest ? latest.published_at : '', views: Number(s.view_count) || 0,
            favorite: favorites.includes(s.id), isDemo: Boolean(s.is_demo) };
    });
    const recent = (a, b) => (b.latestAt || '').localeCompare(a.latestAt || '') || a.name.localeCompare(b.name);
    return list.sort(sort === 'popular' ? (a, b) => b.views - a.views || recent(a, b) : recent);
}
/** 公告横滑（R-HOME-03）：所有未结束公告，置顶优先。 */
function activeAnnouncements(data, now = Date.now()) {
    return c.sortAnnouncements((data.announcements || []).filter(n => n.published !== false).map(n => c.announcement(n, now))).filter(n => !n.ended);
}
/** 最近看过等以 id 列表展示的软件小卡片。 */
function softwareCards(data, ids) {
    const index = latestIndex(data);
    const software = c.visibleSoftware(data).reduce((map, s) => { map[s.id] = s; return map; }, {});
    return ids.filter(id => software[id]).map(id => {
        const s = software[id];
        const latest = index[id] && index[id].latest;
        return { id, slug: s.slug, name: s.name, summary: s.summary || '', icon: c.asset(s.icon_url), color: s.color, version: latest ? latest.version : '', tag: latest ? c.adviceTag(latest) : null };
    });
}
/** 广告位是否开启：总开关 + 位置开关（缺省视为开启，R-AD-04）。 */
function adEnabled(settings, placement) { return Boolean(settings && settings.ads_enabled && (!settings.ad_placements || settings.ad_placements[placement] !== false)); }
module.exports = { PAGE_SIZE, weekInfo, latestIndex, latestMap, feedCards, weekStats, favoriteStates, updateCount, feedItems, hotList, categoryGrid, categoryChips, libraryList, activeAnnouncements, softwareCards, adEnabled };
