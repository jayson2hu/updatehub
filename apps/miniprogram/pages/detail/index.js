// 软件详情（R-MINI-04 = R-DETAIL-01~09/11~22，不含电脑扫码）：
// 结论区按 advice 四档；hold 主按钮复制稳定版；unavailable 不提供本版本入口；设备与版本选择；
// 5 个分段（更新内容 / 安装教程 / 常见问题 / 版本记录 / 软件信息）；反馈；收藏；分享。
// 小程序不能跳外链：下载一律复制链接（提取码随链接一起复制），复制成功上报 dl_copy。
const api = require('../../utils/api');
const c = require('../../utils/content');
const advice = require('../../utils/advice');
const feed = require('../../utils/feed');
const events = require('../../utils/events');
const storage = require('../../utils/storage');
const wx = require('../../utils/platform');

const TABS = [{ id: 'changes', label: '更新内容' }, { id: 'guide', label: '安装教程' }, { id: 'faq', label: '常见问题' }, { id: 'history', label: '版本记录' }, { id: 'info', label: '软件信息' }];

Page({
  data: {
    loading: true, error: '', siteName: storage.siteName(c.SITE_NAME), software: null, favorite: false,
    platform: '', platformName: '', autoDetected: false, devices: [], versions: [], release: null, latest: null, verdict: null, plan: null, kpis: [],
    tabs: TABS, tab: 'changes', diff: null, changes: [], notes: [], screenshots: [], guide: null, faqs: [], timeline: [], info: [],
    feedback: null, feedbackTitle: '更新后能正常用吗？', myVerdict: '', notices: [], similar: [],
    adsEnabled: false, promotions: [], websiteLink: '', shareText: '',
    issueOpen: false, issueKinds: advice.ISSUE_KINDS, issueKind: '', issueNote: '', issueSubmitting: false, shareOpen: false
  },
  onLoad(options) { this._options = options || {}; this._bump = {}; this.load(); },
  onShow() {
    events.page('detail');
    // 从别的页面返回时同步收藏状态（例如在「我的」取消了收藏）。
    if (this._detail) this.setData({ favorite: storage.isFavorite(this._detail.software.id) });
  },
  async load() {
    this.setData({ loading: !this.data.software, error: '' });
    try {
      if (!this._options.slug) throw new Error('软件链接不完整，请返回软件库选择。');
      const detail = await api.request('/station/software/' + encodeURIComponent(this._options.slug), { notFound: '这个软件已下架，或者链接不完整。请返回软件库看看其他软件。' });
      let station = null;
      try { station = await api.station(false); } catch (_) { station = null; /* 站点数据只影响广告、相似软件与站名，失败不阻塞详情。 */ }
      this._detail = detail;
      this._station = station;
      this._releases = c.sortReleases((detail.releases || []).filter(r => r.published !== false));
      const s = detail.software;
      const shared = this._releases.find(r => r.id === this._options.release);
      let detected = '';
      try { detected = advice.detectDevice(wx.getDeviceInfo()); } catch (_) { detected = ''; }
      this._detected = detected;
      // 刷新时保留当前所选设备；首次进入按 R-GLOBAL-05 的顺序决定。
      const pick = s.platforms.includes(this.data.platform) ? { platform: this.data.platform, auto: this.data.autoDetected }
        : advice.defaultDevice({ supported: s.platforms, requested: this._options.platform, sharedPlatform: shared && shared.platform, preferred: storage.device(), detected });
      const settings = (station && station.settings) || {};
      const item = c.appItem(s);
      this.setData({
        software: { ...item, categoryLine: [c.categoryLabels[s.category] || '其他', s.developer].filter(Boolean).join(' · '), favorites: c.formatCount(s.favorite_count) },
        favorite: storage.isFavorite(s.id), autoDetected: pick.auto,
        screenshots: (s.screenshots || []).map(c.asset).filter(Boolean).slice(0, 8),
        notices: c.sortAnnouncements((detail.announcements || []).filter(n => n.published !== false).map(n => c.announcement(n))),
        similar: station ? this.similar(station, s) : [],
        adsEnabled: feed.adEnabled(settings, 'detail_body'), promotions: (station && station.promotions) || [],
        siteName: station ? c.siteName(settings) : this.data.siteName
      });
      const releaseId = this.data.release && this.data.release.platform === pick.platform ? this.data.release.id : shared && shared.platform === pick.platform ? shared.id : '';
      this.choose(pick.platform, releaseId);
      this.recordView(s);
      wx.setNavigationBarTitle({ title: s.name });
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  /** 浏览记录（R-DETAIL-22）：最近看过、已收藏则标记已读、当天首次上报 sw_view。 */
  recordView(s) {
    storage.pushRecent(s.id);
    if (storage.isFavorite(s.id) && this._releases[0]) storage.markSeen(s.id, this._releases[0].published_at);
    events.softwareView(s.id);
  },
  /** 大家还在看（R-DETAIL-20）：同分类优先，不足用热门与其他软件补齐，最多 4 个。 */
  similar(station, s) {
    const hot = feed.hotList(station, 10).map(item => item.id);
    const others = c.visibleSoftware(station).filter(item => item.id !== s.id);
    const ordered = others.filter(item => item.category === s.category)
      .concat(others.filter(item => item.category !== s.category && hot.includes(item.id)), others.filter(item => item.category !== s.category && !hot.includes(item.id)));
    return feed.softwareCards(station, ordered.map(item => item.id)).slice(0, 4);
  },
  /** 切换设备 / 版本后，结论、下载、更新内容、教程、FAQ、版本记录、系统要求全部同步（R-DETAIL-04）。 */
  choose(platform, releaseId) {
    const s = this._detail.software;
    const list = advice.platformReleases(this._releases, platform);
    const latest = list[0] || null;
    const release = list.find(r => r.id === releaseId) || latest;
    const stable = advice.stableRelease(release, this._releases);
    const plan = advice.downloadPlan({ software: s, release, latest, stable, platform });
    const guide = advice.installGuide(s, platform);
    const suffix = `/software/${encodeURIComponent(s.slug)}?platform=${encodeURIComponent(platform)}${release && latest && release.id !== latest.id ? '&release=' + encodeURIComponent(release.id) : ''}`;
    const websiteLink = c.webLink(suffix);
    this._latest = latest;
    this._release = release;
    if (release) events.releaseView(release.id);
    this._stable = stable;
    this.setData({
      platform, platformName: c.names[platform] || '',
      devices: c.platforms.map(p => ({ id: p.id, emoji: p.emoji, label: p.label, disabled: !s.platforms.includes(p.id), selected: p.id === platform, local: p.id === this._detected })),
      versions: list.length > 1 ? advice.versionChoices(list, release && release.id) : [],
      release: release ? { id: release.id, version: release.version, platform: release.platform, latest: Boolean(latest && release.id === latest.id), date: c.shortDate(release.published_at), summary: release.summary || '', install_notice: release.install_notice || '' } : null,
      latest: latest ? { id: latest.id, version: latest.version } : null,
      verdict: advice.verdict(release, platform),
      plan,
      diff: release ? { previous: release.previous_version || '', version: release.version, label: `${c.labels[platform]}版 · ${c.shortDate(release.published_at)}` } : null,
      changes: advice.groupChanges(release && release.changes),
      notes: release && !(release.changes || []).length ? (release.notes || '').split('\n').map(t => t.trim()).filter(Boolean) : [],
      guide, faqs: advice.faqsFor(s, platform), timeline: advice.timeline(list, release && release.id),
      info: this.infoRows(s, release, platform),
      websiteLink,
      shareText: release ? advice.noticeText({ siteName: this.data.siteName, software: s, release, stable, link: websiteLink }) : ''
    });
    this.refreshFeedback();
  },
  /** 软件信息（R-DETAIL-17）：空字段整行隐藏；官网用「复制」代替跳转（R-MINI-04）。 */
  infoRows(s, release, platform) {
    const rows = [
      { label: '开发者', value: s.developer },
      { label: '收费说明', value: s.pricing },
      { label: '收录日期', value: String(s.listed_at || s.created_at || '').slice(0, 10) },
      { label: '官方网站', value: c.host(s.website_url), copy: c.safeUrl(s.website_url) },
      { label: '分类', value: c.categoryLabels[s.category] || '' },
      { label: '支持设备', value: c.platforms.filter(p => s.platforms.includes(p.id)).map(p => p.name).join('、') },
      { label: '系统要求', value: release && release.requirements },
      { label: '安装包大小', value: platform === 'ios' ? '' : release && release.package_size },
      { label: '标签', value: (s.tags || []).join('、') }
    ];
    return rows.filter(row => row.value);
  },
  /** 反馈对象 = 所选设备的当前版本（R-DETAIL-18）。数字 = 接口计数 + 本次会话刚提交的票。 */
  refreshFeedback() {
    const target = this._latest;
    if (!target) { this.setData({ feedback: null, myVerdict: '' }); return; }
    const bump = this._bump[target.id] || { ok: 0, issue: 0 };
    const summary = advice.feedbackSummary((Number(target.feedback_ok) || 0) + bump.ok, (Number(target.feedback_issue) || 0) + bump.issue);
    const mine = storage.feedback()[target.id];
    const selectedOld = this._release && this._release.id !== target.id;
    this.setData({
      feedback: { ...summary, bar: summary.total ? summary.percent : 0 },
      myVerdict: mine ? mine.verdict : '',
      feedbackTitle: selectedOld ? `最新版 ${target.version} 能正常用吗？` : '更新后能正常用吗？',
      kpis: [
        summary.few ? { value: '—', label: '反馈较少', tone: '' } : { value: summary.percent + '%', label: '反馈能用', tone: 'ok' },
        { value: c.formatCount(this._detail.software.favorite_count), label: '人收藏', tone: '' },
        { value: c.shortDate(target.published_at), label: '最近更新', tone: '' }
      ]
    });
  },
  onDevice(event) {
    const d = event.currentTarget.dataset;
    if (d.disabled) { wx.showToast({ title: '暂无此设备版本', icon: 'none' }); return; }
    if (d.id !== this.data.platform) this.setData({ autoDetected: false });
    this.choose(d.id);
  },
  onVersion(event) { this.choose(this.data.platform, event.currentTarget.dataset.id); },
  /** 版本记录里「复制这个版本的链接」等同于在版本条选中，并滚回下载区（R-DETAIL-05）。 */
  selectTimeline(event) { this.choose(this.data.platform, event.currentTarget.dataset.id); wx.pageScrollTo({ selector: '#download', duration: 300 }); },
  onTab(event) { this.setData({ tab: event.currentTarget.dataset.id }); },
  toggleFaq(event) { const index = Number(event.currentTarget.dataset.index); this.setData({ [`faqs[${index}].open`]: !this.data.faqs[index].open }); },
  /** 复制成功（copy-link 的 copied 事件）：下载类入口记一次下载点击（§7.5）。 */
  onCopied(event) { const id = event.currentTarget.dataset.release; if (id) events.downloadCopy(id); },
  toggleFavorite() {
    const s = this._detail && this._detail.software;
    if (!s) return;
    const added = storage.toggleFavorite(s.id, this._releases[0] && this._releases[0].published_at);
    events.favorite(s.id, added);
    this.setData({ favorite: added });
    wx.showToast({ title: added ? '已收藏，有新版本会提醒你' : '已取消收藏', icon: 'none' });
  },
  record(verdict, kind) {
    const target = this._latest;
    return { verdict, kind: kind || '', softwareId: this._detail.software.id, slug: this._detail.software.slug, name: this._detail.software.name, version: target.version, platform: target.platform };
  },
  failToast(error) { wx.showToast({ title: error && error.statusCode === 429 ? '提交太频繁，请稍后再试' : '提交失败，请稍后再试', icon: 'none' }); },
  async castVote(verdict, details) {
    const target = this._latest;
    if (!target || this._voting) return null;
    const old = storage.feedback()[target.id];
    if (old && !old.receipt) { wx.showToast({title:'这条旧版反馈暂不能修改，新版可正常改投',icon:'none'}); return null; }
    this._voting = true;
    try {
      const result = await api.post('/station/feedback/vote', {release_id:target.id, verdict, receipt:old ? old.receipt : '', channel:wx.target, action:details ? 'details' : 'vote', ...(details || {})}, {invalidate:true});
      target.feedback_ok = result.oks; target.feedback_issue = result.issues;
      this._bump[target.id] = {ok:0,issue:0};
      storage.setFeedback(target.id, verdict === 'none' ? null : {...this.record(verdict, details && details.kind),receipt:result.receipt});
      this.refreshFeedback();
      return result;
    } catch (error) { this.failToast(error); return null; }
    finally { this._voting = false; }
  },
  async voteOk() {
    const verdict = this.data.myVerdict === 'ok' ? 'none' : 'ok';
    const result = await this.castVote(verdict);
    if (result) wx.showToast({title:verdict === 'none' ? '已撤销你的反馈' : '谢谢你的反馈 👍',icon:'none'});
    return Boolean(result);
  },
  async openIssue() {
    const verdict = this.data.myVerdict === 'issue' ? 'none' : 'issue';
    const result = await this.castVote(verdict);
    if (!result) return false;
    if (verdict === 'none') wx.showToast({title:'已撤销你的反馈',icon:'none'});
    else this.setData({issueOpen:true,issueKind:'',issueNote:''});
    return true;
  },
  closeIssue() { this.setData({ issueOpen: false }); },
  chooseIssueKind(event) { this.setData({ issueKind: event.currentTarget.dataset.id }); },
  onIssueNote(event) { const value = String(event.detail.value || '').slice(0, 300); this.setData({ issueNote: value }); return value; },
  async submitIssue() {
    if (!this._latest || !this.data.issueKind || this.data.issueSubmitting) return false;
    this.setData({issueSubmitting:true});
    try {
      if (this.data.myVerdict !== 'issue' && !(await this.castVote('issue'))) return false;
      const result = await this.castVote('issue', {kind:this.data.issueKind,note:this.data.issueNote.trim()});
      if (!result) return false;
      this.setData({issueOpen:false});
      wx.showToast({title:'已提交，群主会尽快处理',icon:'none'});
      return true;
    } finally { this.setData({issueSubmitting:false}); }
  },
  openShare() { this.setData({ shareOpen: true }); },
  closeShare() { this.setData({ shareOpen: false }); },
  openNotice(event) { wx.navigateTo({ url: '/pages/announcement/index?slug=' + encodeURIComponent(event.currentTarget.dataset.slug) }); },
  openSoftware(event) { wx.navigateTo({ url: c.detailRoute(event.currentTarget.dataset.slug) }); },
  preview(event) { wx.previewImage({ urls: this.data.screenshots, current: event.currentTarget.dataset.src }); },
  noop() {},
  onPullDownRefresh() { this.load(); },
  retry() { this.load(); },
  /** 原生分享（R-MINI-08）：标题含版本号与建议，路径保留 slug、设备、版本。 */
  onShareAppMessage() {
    const s = this.data.software;
    const r = this.data.release;
    const title = s ? `${s.name}${r ? ' ' + c.labels[this.data.platform] + '版 ' + r.version : ''}${this.data.verdict ? ' · ' + this.data.verdict.label : ''}` : this.data.siteName;
    this.setData({ shareOpen: false });
    return { title, path: c.detailRoute(this._options.slug, this.data.platform, r && r.id) };
  },
  onShareTimeline() { const share = this.onShareAppMessage(); return { title: share.title, query: share.path.split('?')[1] || '' }; }
});
