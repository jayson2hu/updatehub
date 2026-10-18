const api = require('./api');
const content = require('./content');
const wx = require('./platform');
module.exports = function listingPage(mode) {
    return {
        data: { loading: true, error: '', settings: { site_name: '更新小站', site_description: '软件更新、安装说明和群公告，都在这里。' }, query: '', selectedPlatform: 'all', platforms: [], software: [], releases: [], pinned: null, promotions: [], hasDemo: false, mode },
        onLoad() { this.load(false); },
        onShow() { if (this._station) {
            this.setData({ pinned: content.pinned(this._station) });
            if (Date.now() - (this._loadedAt || 0) > 30000)
                this.load(true);
        } },
        async load(force) { this.setData({ loading: !this._station, error: '' }); try {
            const data = await api.station(force);
            this._station = data;
            this._loadedAt = Date.now();
            this.setData({ settings: data.settings, hasDemo: data.software.some(s => s.is_demo), promotions: data.promotions || [], pinned: content.pinned(data), platforms: [{ id: 'all', label: '全部' }, ...content.platforms.filter(p => data.software.some(s => s.platforms.includes(p.id)))] });
            this.applyFilters();
            wx.setNavigationBarTitle({ title: mode === 'directory' ? '软件目录' : data.settings.site_name });
        }
        catch (error) {
            this.setData({ error: error.message });
        }
        finally {
            this.setData({ loading: false });
            wx.stopPullDownRefresh();
        } },
        onPullDownRefresh() { this.load(true); },
        retry() { this.load(true); },
        applyFilters() { if (this._station)
            this.setData(content.filterContent(this._station, this.data.query, this.data.selectedPlatform)); },
        onSearch(event) { this.setData({ query: event.detail.value }); this.applyFilters(); },
        onPlatform(event) { this.setData({ selectedPlatform: event.currentTarget.dataset.id }); this.applyFilters(); },
        clear() { this.setData({ query: '', selectedPlatform: 'all' }); this.applyFilters(); },
        openSoftware(event) { const d = event.currentTarget.dataset; wx.navigateTo({ url: content.detailRoute(d.slug, d.platform, d.release) }); },
        openNotice(event) { wx.navigateTo({ url: '/pages/announcement/index?slug=' + encodeURIComponent(event.currentTarget.dataset.slug) }); },
        allNotices() { wx.switchTab({ url: '/pages/announcements/index' }); },
        onShareAppMessage() { return { title: this.data.settings.site_name + ' · 软件更新与群公告', path: mode === 'directory' ? '/pages/software/index' : '/pages/latest/index' }; }
    };
};
