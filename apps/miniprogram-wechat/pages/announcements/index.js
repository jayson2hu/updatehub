const api = require('../../utils/api');
const c = require('../../utils/content');
const wx = require('../../utils/platform');
Page({ data: { loading: true, error: '', category: 'all', categories: [{ id: 'all', label: '全部' }, { id: 'group', label: '群公告' }, { id: 'usage', label: '使用提醒' }, { id: 'maintenance', label: '维护通知' }], notices: [] }, onLoad() { this.load(false); }, onShow() { if (this._notices)
        this.filter(); }, async load(force) { this.setData({ loading: !this._notices, error: '' }); try {
        const data = await api.station(force);
        this._notices = data.announcements.filter(n => n.published !== false);
        this.filter();
    }
    catch (error) {
        this.setData({ error: error.message });
    }
    finally {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
    } }, filter() { const items = (this._notices || []).map(c.announcement).filter(n => this.data.category === 'all' || n.category === this.data.category).sort((a, b) => Number(b.activePinned) - Number(a.activePinned) || (b.published_at || '').localeCompare(a.published_at || '')); this.setData({ notices: items }); }, onCategory(event) { this.setData({ category: event.currentTarget.dataset.id }); this.filter(); }, clear() { this.setData({ category: 'all' }); this.filter(); }, onPullDownRefresh() { this.load(true); }, retry() { this.load(true); }, openNotice(event) { wx.navigateTo({ url: '/pages/announcement/index?slug=' + encodeURIComponent(event.currentTarget.dataset.slug) }); }, onShareAppMessage() { return { title: '更新小站 · 群内公告', path: '/pages/announcements/index' }; } });
