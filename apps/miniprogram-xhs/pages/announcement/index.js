const api = require('../../utils/api');
const c = require('../../utils/content');
const wx = require('../../utils/platform');
Page({ data: { loading: true, error: '', notice: null, software: [], websiteLink: '' }, onLoad(options) { this._slug = options.slug; this.load(); }, async load() { this.setData({ loading: !this.data.notice, error: '' }); try {
        if (!this._slug)
            throw new Error('公告链接不完整，请返回公告列表选择。');
        const notice = await api.request('/station/announcements/' + encodeURIComponent(this._slug));
        let data;
        try {
            data = await api.station(false);
        }
        catch (_) {
            data = { software: [] };
        }
        this.setData({ notice: c.announcement(notice), software: data.software.filter(s => notice.software_ids.includes(s.id)).map(c.appItem), websiteLink: c.webLink('/announcements/' + encodeURIComponent(this._slug)) });
        wx.setNavigationBarTitle({ title: '公告详情' });
        wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
    catch (error) {
        this.setData({ error: error.message });
    }
    finally {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
    } }, onPullDownRefresh() { this.load(); }, retry() { this.load(); }, openSoftware(event) { wx.navigateTo({ url: c.detailRoute(event.currentTarget.dataset.slug) }); }, preview(event) { wx.previewImage({ urls: this.data.notice.images, current: event.currentTarget.dataset.src }); }, onShareAppMessage() { var _a; return { title: ((_a = this.data.notice) === null || _a === void 0 ? void 0 : _a.title) || '群内公告', path: '/pages/announcement/index?slug=' + encodeURIComponent(this._slug || '') }; }, onShareTimeline() { var _a; return { title: ((_a = this.data.notice) === null || _a === void 0 ? void 0 : _a.title) || '群内公告', query: 'slug=' + encodeURIComponent(this._slug || '') }; } });
