// 搜索（R-SEARCH-03/04）：不区分大小写、全半角归一后包含匹配；高亮拆成文本片段，WXML 逐段渲染，不拼 HTML，天然防注入。
const c = require('./content');

/**
 * 逐字归一（NFKC + 小写）。只有归一后长度不变的字符才替换，保证归一串与原文下标一一对应，
 * 这样在归一串里找到的位置可以直接切原文。
 */
function fold(text) {
  let out = '';
  for (const ch of String(text || '')) {
    let n = ch;
    try { n = ch.normalize('NFKC').toLowerCase(); } catch (_) { n = ch.toLowerCase(); }
    out += n.length === ch.length ? n : ch;
  }
  return out;
}
function normalizeQuery(query) { return fold(String(query || '').trim().replace(/\s+/g, ' ')); }

/** 高亮切分：返回 [{text, hit}]；没有命中时返回整段原文。 */
function highlight(text, query) {
  const source = String(text || '');
  const term = normalizeQuery(query);
  if (!source) return [];
  if (!term) return [{ text: source, hit: false, key: 0 }];
  const folded = fold(source);
  const parts = [];
  let from = 0;
  let at = folded.indexOf(term);
  while (at !== -1) {
    if (at > from) parts.push({ text: source.slice(from, at), hit: false });
    parts.push({ text: source.slice(at, at + term.length), hit: true });
    from = at + term.length;
    at = folded.indexOf(term, from);
  }
  if (from < source.length) parts.push({ text: source.slice(from), hit: false });
  return parts.map((part, key) => ({ ...part, key })); // key 供 wx:key 使用
}
function matches(values, term) { return values.some(value => fold(value).includes(term)); }

/** 搜索软件与公告。下架软件、撤回公告不参与；软件组在前。 */
function searchAll(data, query) {
  const term = normalizeQuery(query);
  if (!term) return { term: '', software: [], notices: [], total: 0 };
  const index = {};
  c.sortReleases(c.visibleReleases(data)).forEach(r => { if (!index[r.software_id]) index[r.software_id] = r; });
  const software = c.visibleSoftware(data).filter(s => matches([s.name, ...(s.aliases || []), s.summary || '', ...(s.tags || []), c.categoryLabels[s.category] || ''], term)).map(s => {
    const latest = index[s.id];
    const alias = (s.aliases || []).find(a => fold(a).includes(term) && !fold(s.name).includes(term));
    return { id: s.id, slug: s.slug, name: s.name, icon: c.asset(s.icon_url), color: s.color, nameParts: highlight(s.name, query), summaryParts: highlight(s.summary || '', query),
      aliasParts: alias ? highlight('别名：' + alias, query) : [], tag: latest ? c.adviceTag(latest) : null, version: latest ? latest.version : '' };
  });
  const notices = (data.announcements || []).filter(n => n.published !== false && matches([n.title, n.summary || '', n.body || ''], term)).map(n => {
    const item = c.announcement(n);
    return { id: n.id, slug: n.slug, titleParts: highlight(n.title, query), date: item.shortDate, ended: item.ended, categoryText: item.categoryText, tone: item.tone };
  });
  return { term, software, notices, total: software.length + notices.length };
}

/** 热门搜索词：统计接口（已合并后台配置）优先，其次站点设置；前 3 个带 🔥。 */
function hotSearches(data) {
  const fromStats = (data.stats && Array.isArray(data.stats.hot_searches)) ? data.stats.hot_searches : [];
  const fromSettings = (data.settings && Array.isArray(data.settings.hot_searches)) ? data.settings.hot_searches : [];
  const list = (fromStats.length ? fromStats : fromSettings).filter(item => typeof item === 'string' && item.trim()).slice(0, 8);
  return list.map((word, index) => ({ word, text: (index < 3 ? '🔥 ' : '') + word }));
}

module.exports = { fold, normalizeQuery, highlight, searchAll, hotSearches };
