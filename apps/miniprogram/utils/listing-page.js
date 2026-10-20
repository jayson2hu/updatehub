// 底栏页面（首页 / 软件库 / 公告 / 我的）共用逻辑：读取站点数据、站名标题、下拉刷新、错误重试、
// 统计 page_view、刷新「我的」角标。各页面只提供 render(data) 与自己的事件处理。
const api = require('./api');
const content = require('./content');
const feed = require('./feed');
const events = require('./events');
const storage = require('./storage');
const wx = require('./platform');

const ME_TAB_INDEX = 3;

/** 「我的」角标 = 有新版的收藏数（R-GLOBAL-02 / R-MINI-01）；不支持角标的宿主静默跳过。 */
function refreshBadge(data) {
  const count = data ? feed.updateCount(data) : 0;
  if (count) wx.setTabBarBadge({ index: ME_TAB_INDEX, text: count > 99 ? '99+' : String(count), fail() {} });
  else wx.removeTabBarBadge({ index: ME_TAB_INDEX, fail() {} });
  return count;
}

/**
 * options.page：统计用页面名；options.title(siteName)：导航栏标题；options.render(data)：渲染；
 * options.data / options.methods：页面自己的初始数据与方法；options.onLoad / options.onShow：附加钩子。
 */
function tabPage(options) {
  const siteName = storage.siteName(content.SITE_NAME);
  const definition = {
    data: { loading: true, error: '', siteName, settings: { site_name: siteName }, ...(options.data || {}) },
    onLoad(query) {
      this._query = query || {};
      this.applyTitle(this.data.siteName);
      if (options.onLoad) options.onLoad.call(this, this._query);
      this.load(false);
    },
    onShow() {
      events.page(options.page);
      if (options.onShow) options.onShow.call(this);
      if (!this._station) return;
      const state = api.shared();
      // 写操作让缓存失效或超过 30 秒时重新拉取，否则只用本机最新的收藏、已读状态重新渲染。
      if (state.stationVersion !== this._version || Date.now() - (this._loadedAt || 0) > api.CACHE_MS) this.load(true);
      else this.render();
    },
    applyTitle(name) { wx.setNavigationBarTitle({ title: options.title ? options.title(name) : name }); },
    async load(force) {
      this.setData({ loading: !this._station, error: '' });
      try {
        const data = await api.station(force);
        this._station = data;
        this._loadedAt = Date.now();
        this._version = api.shared().stationVersion;
        const name = content.siteName(data.settings);
        storage.setSiteName(name);
        this.setData({ settings: { ...data.settings, site_name: name }, siteName: name });
        this.applyTitle(name);
        this.render();
      } catch (error) {
        this.setData({ error: error.message });
      } finally {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
      }
    },
    render() {
      if (!this._station) return;
      options.render.call(this, this._station);
      refreshBadge(this._station);
    },
    onPullDownRefresh() { this.load(true); },
    retry() { this.load(true); },
    openSoftware(event) { const d = event.currentTarget.dataset; if (d.slug) wx.navigateTo({ url: content.detailRoute(d.slug, d.platform, d.release) }); },
    openNotice(event) { wx.navigateTo({ url: '/pages/announcement/index?slug=' + encodeURIComponent(event.currentTarget.dataset.slug) }); },
    openSearch() { wx.navigateTo({ url: '/pages/search/index' }); },
    noop() {},
    onShareAppMessage() { return { title: this.data.siteName + ' · ' + (options.shareTitle || '软件更新与群公告'), path: options.path }; },
    ...(options.methods || {})
  };
  return definition;
}

module.exports = tabPage;
module.exports.refreshBadge = refreshBadge;
