// 公告详情（R-MINI-05 = R-ANN-03/04）：已结束提示、置顶 / 类型 / 日期 / 有效期、正文与配图、
// 正文外链显示为可复制文本、相关软件（版本 · 日期 · 建议）、复制网站公告链接、原生分享（R-MINI-08）。
const api = require('../../utils/api');
const c = require('../../utils/content');
const feed = require('../../utils/feed');
const events = require('../../utils/events');
const storage = require('../../utils/storage');
const wx = require('../../utils/platform');

Page({
  data: { loading: true, error: '', notice: null, software: [], websiteLink: '', siteName: storage.siteName(c.SITE_NAME) },
  onLoad(options) { this._slug = options.slug; this.load(); },
  onShow() { events.page('announcement'); },
  async load() {
    this.setData({ loading: !this.data.notice, error: '' });
    try {
      if (!this._slug) throw new Error('公告链接不完整，请返回公告列表选择。');
      const notice = await api.request('/station/announcements/' + encodeURIComponent(this._slug), { notFound: '这条公告已经撤回，或者链接不完整。' });
      let data;
      try { data = await api.station(false); } catch (_) { data = { software: [], releases: [], settings: {} }; }
      const index = feed.latestIndex(data);
      const software = c.visibleSoftware(data).filter(s => (notice.software_ids || []).includes(s.id)).map(s => {
        const latest = index[s.id] && index[s.id].latest;
        return { id: s.id, slug: s.slug, name: s.name, icon: c.asset(s.icon_url), color: s.color, meta: latest ? `${latest.version} · ${c.shortDate(latest.published_at)}` : '暂未发布版本', tag: latest ? c.adviceTag(latest) : null };
      });
      const item = c.announcement(notice);
      this.setData({ notice: { ...item, metaText: `${item.shortDate}发布${item.expiresText ? ' · 有效期到 ' + item.expiresText : ''} · ${item.view_count || 0} 人看过` }, software,
        websiteLink: c.webLink('/announcements/' + encodeURIComponent(this._slug)), siteName: data.settings && data.settings.site_name ? c.siteName(data.settings) : this.data.siteName });
      events.announcementView(notice.id);
      wx.setNavigationBarTitle({ title: '公告详情' });
      wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (error) {
      this.setData({ error: error.message });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  onPullDownRefresh() { this.load(); },
  retry() { this.load(); },
  openSoftware(event) { wx.navigateTo({ url: c.detailRoute(event.currentTarget.dataset.slug) }); },
  preview(event) { wx.previewImage({ urls: this.data.notice.images, current: event.currentTarget.dataset.src }); },
  onShareAppMessage() { return { title: this.data.notice?.title || this.data.siteName + ' · 群公告', path: '/pages/announcement/index?slug=' + encodeURIComponent(this._slug || '') }; },
  onShareTimeline() { return { title: this.data.notice?.title || this.data.siteName + ' · 群公告', query: 'slug=' + encodeURIComponent(this._slug || '') }; }
});
