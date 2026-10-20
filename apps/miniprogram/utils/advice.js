// 软件详情的结论与下载规则（R-DETAIL-03/05/06/07/13~18/21，R-MINI-04）。
// 小程序不能跳外链：所有下载入口都是「复制链接」，这里只决定复制什么、按钮写什么、显示哪些提示。
const c = require('./content');

const CHANGE_KINDS = [
  { kind:'added', label:'新增', cls:'add' },
  { kind:'fixed', label:'修复', cls:'fix' },
  { kind:'improved', label:'优化', cls:'opt' },
  { kind:'known_issue', label:'已知问题', cls:'known' }
];
const ISSUE_KINDS = [
  { id:'crash', label:'闪退' }, { id:'install', label:'装不上' }, { id:'download', label:'下载不了' },
  { id:'login', label:'登录不了' }, { id:'link', label:'链接失效' }, { id:'other', label:'其他' }
];
// 软件未填写该设备教程时的提示（R-DETAIL-14 的提示框，按小程序场景改写）。
const GUIDE_TIPS = {
  android: '小程序里不能直接下载，复制链接后用手机自带浏览器打开。',
  ios: '苹果手机只能从 App Store 安装，本站不提供其他安装方式。',
  tv: '电视第一次装软件时，需要在「设置 → 安全」里打开“允许安装未知来源”。',
  desktop: '安装路径尽量不要有中文。'
};
const FAQ_FALLBACK = { question:'以上都没解决？', answer:'点下方“有问题”提交反馈，或在群里 @群主，说一下设备型号和卡在哪一步。', fixed:true };

/** 某设备已发布的版本，按发布时间倒序；第一个即当前版本。 */
function platformReleases(releases, platform) { return c.sortReleases((releases || []).filter(r => r.platform === platform && r.published !== false)); }

/**
 * hold 稳定版选择：只有当前所选为 hold 且 stable_release_id 指向同软件、同设备、已发布的其他版本时才返回该版本。
 */
function stableRelease(release, releases) {
  if (!release || c.adviceOf(release) !== 'hold' || !release.stable_release_id) return null;
  const stable = (releases || []).find(r => r.id === release.stable_release_id);
  if (!stable || stable.id === release.id || stable.platform !== release.platform || stable.software_id !== release.software_id || stable.published === false) return null;
  return stable;
}

/** 结论条（R-DETAIL-03）：{tone, icon, title, note} */
function verdict(release, platform) {
  if (!release) return null;
  const meta = c.advice[c.adviceOf(release)];
  return { tone: meta.tone, icon: meta.icon, label: meta.label, title: `${meta.label} · ${c.labels[platform] || ''}版 ${release.version}`, note: release.advice_note || release.summary || '' };
}

/** 版本条（R-DETAIL-05）：最新 / 有问题（hold 的旧版）/ 旧版 */
function versionChoices(list, selectedId) {
  return list.map((r, index) => ({ id: r.id, version: r.version, date: c.shortDate(r.published_at), current: index === 0, selected: r.id === selectedId,
    tag: index === 0 ? '最新' : c.adviceOf(r) === 'hold' ? '有问题' : '旧版' }));
}

/** 可用的入口：is_active 不为 false、地址安全。kind 缺省按官方处理（兼容旧数据）。 */
function activeLinks(release) { return ((release && release.links) || []).filter(l => l && l.is_active !== false && c.safeUrl(l.url)); }
function officialLinks(release) { const list = activeLinks(release).filter(l => (l.kind || 'official') === 'official'); return list.filter(l => l.is_primary).concat(list.filter(l => !l.is_primary)); }
function copyValue(link) { return link.code ? `${link.url} 提取码 ${link.code}` : link.url; }

/**
 * 下载区方案。返回：
 *  notes：提示条 [{tone:'bad'|'warn'|'info'|'old', text}]
 *  primary：{label, short, value, releaseId, toast} 或 null（按钮禁用，文案见 disabledText）
 *  secondary：hold 时「仍要复制 x 链接」
 *  backups：备用网盘 / 其他官方入口，复制「链接 提取码 code」
 *  meta：来源行；iosHint：苹果提示；desktopTip：手机看电脑版提示
 */
function downloadPlan({ software, release, latest, stable, platform }) {
  const plan = { notes: [], primary: null, selectStable: null, secondary: null, backups: [], meta: [], installNotice: '', disabledText: '', iosHint: '', desktopTip: platform === 'desktop' };
  if (!release) { plan.disabledText = '这个设备暂未发布版本'; return plan; }
  const short = c.labels[platform] || '';
  const isLatest = !latest || latest.id === release.id;
  const state = c.releaseState(software, release);
  const ios = platform === 'ios';
  const toast = '链接已复制，请到浏览器粘贴打开';
  const label = (version, isStable) => isStable ? `⬇ 复制稳定版 ${version} 下载链接` : ios ? '⬇ 复制 App Store 链接' : `⬇ 复制${short}版${isLatest ? '' : ' ' + version + ' '}下载链接`;
  const shortLabel = (version, isStable) => isStable ? `⬇ 复制稳定版 ${version}` : ios ? '⬇ 复制 App Store 链接' : `⬇ 复制${short}版${isLatest ? '' : ' ' + version + ' '}链接`;
  const entry = (link, r, isStable) => ({ label: label(r.version, isStable), short: shortLabel(r.version, isStable), value: link.url, code: link.code || '', releaseId: r.id, toast, source: c.host(link.url) });

  if (!isLatest) plan.notes.push({ tone: 'old', text: `你正在看旧版本 ${release.version}。` + (c.adviceOf(latest) === 'hold' ? `最新版 ${latest.version} 有使用提醒，请先查看更新建议。` : `没有特别需要，建议下载最新版 ${latest.version}。`) });
  const stableUsable = stable && c.releaseState(software, stable).status !== 'unavailable' ? stable : null;
  const target = isLatest && stableUsable && (c.adviceOf(release) === 'hold' || state.status === 'unavailable') ? stableUsable : release;
  const stableLink = target !== release ? officialLinks(target)[0] : null;
  const selectStable = () => { plan.selectStable = { releaseId: target.id, label: `查看稳定版 ${target.version} 入口`, short: `查看稳定版 ${target.version}` }; };
  plan.installNotice = target.install_notice ? `安装前请注意${target !== release ? `（稳定版 ${target.version}）` : ''}：${target.install_notice}` : '';
  const ownLink = state.status === 'unavailable' ? null : officialLinks(release)[0];

  if (state.status === 'unavailable') {
    // 不可用：本版本不提供任何入口；有可用稳定版时主按钮改为稳定版（R-DETAIL-21）。
    plan.notes.push({ tone: 'bad', text: '这个版本暂时无法下载' + (state.reason ? '：' + state.reason : '。') });
    if (stableLink) plan.primary = entry(stableLink, target, true);
    else if (target !== release) selectStable();
    else plan.disabledText = '暂时无法下载';
    return finishMeta(plan, target, platform);
  }
  if (state.status === 'attention' && state.reason) plan.notes.push({ tone: 'warn', text: '⚠ ' + state.reason });

  if (c.adviceOf(release) === 'hold' && isLatest) {
    if (stableUsable) {
      // 先别更新：主按钮复制稳定版，次按钮仍可复制当前版本（R-DETAIL-07）。
      plan.notes.push({ tone: 'bad', text: `⚠ ${release.version} 有问题，建议先下载稳定版 ${stableUsable.version}` });
      if (stableLink) {
        plan.primary = entry(stableLink, stableUsable, true);
      } else selectStable();
      if (ownLink) plan.secondary = { label: `仍要复制 ${release.version} 链接`, value: ownLink.url, code: ownLink.code || '', releaseId: release.id, toast };
    } else {
      plan.notes.push({ tone: 'bad', text: `⚠ ${release.version} 有问题，建议暂时不要更新` });
      if (ownLink) plan.primary = entry(ownLink, release, false);
    }
  } else if (ownLink) plan.primary = entry(ownLink, release, false);

  if (!plan.primary) plan.disabledText = '暂无下载链接';
  if (ios && plan.primary) plan.iosHint = `也可以直接在 App Store 搜索“${software.name}”`;
  // 备用：网盘链接，以及主入口之外的其他官方入口；苹果不显示网盘。
  const used = [plan.primary && plan.primary.value, plan.secondary && plan.secondary.value];
  plan.backups = activeLinks(release).filter(l => !used.includes(l.url) && !(ios && l.kind === 'netdisk')).map(l => ({
    id: l.id || l.url, title: l.kind === 'netdisk' ? '备用：网盘下载' : '其他官方入口', source: l.label || c.host(l.url), url: l.url, code: l.code || '',
    value: copyValue(l), label: l.code ? '复制链接和提取码' : '复制链接', toast: l.code ? '链接和提取码已复制' : '链接已复制', releaseId: release.id }));
  return finishMeta(plan, target, platform);
}
function finishMeta(plan, release, platform) {
  const source = plan.primary && plan.primary.source;
  if (source) plan.meta.push('✓ 官方来源 ' + source);
  if (platform === 'ios') { if (plan.primary) plan.meta.push('📦 App Store'); } else if (release.package_size) plan.meta.push('📦 ' + release.package_size);
  if (release.requirements) plan.meta.push('🖥 ' + release.requirements);
  return plan;
}

/** 更新内容按「新增 → 修复 → 优化 → 已知问题」排序，丢弃空条目与未知类型（R-DETAIL-13）。 */
function groupChanges(changes) {
  const order = CHANGE_KINDS.map(k => k.kind);
  return (changes || []).filter(item => item && order.includes(item.kind) && String(item.text || '').trim())
    .map((item, index) => ({ ...CHANGE_KINDS[order.indexOf(item.kind)], text: String(item.text).trim(), index }))
    .sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind) || a.index - b.index);
}

/** 安装教程：优先该设备的 install_guides，没有时退回通用 installation（Q11）。 */
function installGuide(software, platform) {
  const guides = (software && software.install_guides) || {};
  const own = Array.isArray(guides[platform]) ? guides[platform].filter(Boolean) : [];
  const general = Array.isArray(software && software.installation) ? software.installation.filter(Boolean) : [];
  const steps = own.length ? own : general;
  const images = (software && software.install_illustrations && software.install_illustrations[platform]) || {};
  const illustrations = steps.map((_, i) => c.asset(images[i] || ''));
  return { title: `${c.names[platform] || ''}安装教程`, steps, illustrations, source: own.length ? 'platform' : general.length ? 'general' : 'none',
    minutes: steps.length ? `大约 ${Math.max(1, Math.ceil(steps.length * 1.5))} 分钟` : '', tip: (software && software.install_tips && software.install_tips[platform]) || GUIDE_TIPS[platform] || '' };
}

/** 常见问题：platforms 为空表示适用所有设备；末尾固定「以上都没解决？」（R-DETAIL-15）。 */
function faqsFor(software, platform) {
  const list = ((software && software.faqs) || []).filter(f => f && f.question && (!Array.isArray(f.platforms) || !f.platforms.length || f.platforms.includes(platform)));
  return list.map(f => ({ question: f.question, answer: f.answer || '', open: false })).concat([{ ...FAQ_FALLBACK, open: false }]);
}

/** 能用率（§7.4）：反馈 < 5 条显示「反馈较少」；p < 60% 且 ≥ 10 条时提示问题较多。 */
function feedbackSummary(ok, issue) {
  const okCount = Math.max(0, Number(ok) || 0);
  const issueCount = Math.max(0, Number(issue) || 0);
  const total = okCount + issueCount;
  const percent = total ? Math.round(okCount * 100 / total) : 0;
  return { ok: okCount, issue: issueCount, total, percent, few: total < 5, warn: total >= 10 && percent < 60,
    rateText: total < 5 ? '👍 反馈较少' : `👍 ${percent}% 能用` };
}

/** 版本记录时间线（R-DETAIL-16） */
function timeline(list, selectedId) {
  return list.map((r, index) => ({ id: r.id, version: r.version, date: c.shortDate(r.published_at), summary: r.summary || '', tag: c.adviceTag(r),
    current: index === 0, bad: c.adviceOf(r) === 'hold', selected: r.id === selectedId, canSelect: index > 0 }));
}

/** 群通知文案（UI 规范 §7.4），用于分享弹层「复制群文案」。 */
function noticeText({ siteName, software, release, stable, link }) {
  const meta = c.advice[c.adviceOf(release)];
  const lines = [`【${siteName}】${software.name} ${release.version} 更新了`, release.summary || '', meta.notice];
  if (stable) lines.push(`👉 需要的话先装稳定版 ${stable.version}`);
  lines.push('', '下载和安装方法 👇', link, '（小红书里打不开就点右上角···，选“在浏览器打开”）');
  return lines.filter((line, index) => line !== '' || index > 2).join('\n');
}

/**
 * 默认设备（R-GLOBAL-05）：① 链接参数 platform（或分享版本所在设备）② 我的常用设备 ③ 本机识别 ④ 软件支持的第一个设备。
 * 返回 {platform, auto}；auto 为 true 表示由本机识别得出（界面显示「已自动识别」）。
 */
function defaultDevice({ supported = [], requested = '', sharedPlatform = '', preferred = '', detected = '' }) {
  const has = id => Boolean(id) && supported.includes(id);
  if (has(requested)) return { platform: requested, auto: false };
  if (has(sharedPlatform)) return { platform: sharedPlatform, auto: false };
  if (has(preferred)) return { platform: preferred, auto: false };
  if (has(detected)) return { platform: detected, auto: true };
  const first = c.platforms.map(p => p.id).find(has);
  return { platform: first || supported[0] || '', auto: false };
}
/** 宿主平台 → 设备：ios / android；windows、mac 视为电脑；开发者工具返回 ''。 */
function detectDevice(info) {
  const value = String((info && info.platform) || '').toLowerCase();
  if (value === 'ios') return 'ios';
  if (value === 'android' || value === 'ohos') return 'android';
  if (value === 'windows' || value === 'mac') return 'desktop';
  return '';
}

module.exports = { CHANGE_KINDS, ISSUE_KINDS, GUIDE_TIPS, platformReleases, stableRelease, verdict, versionChoices, officialLinks, downloadPlan, groupChanges, installGuide, faqsFor, feedbackSummary, timeline, noticeText, defaultDevice, detectDevice };
