// 搜索（R-MINI-06 = R-SEARCH-02~05）：热门搜索、搜索历史、最近看过；输入即搜（防抖 250ms），命中文字高亮；
// 停止输入 1 秒或回车后上报一次 search / search_miss；搜不到时可以提交想要的软件。
const api = require('../../utils/api');
const c = require('../../utils/content');
const feed = require('../../utils/feed');
const search = require('../../utils/search');
const storage = require('../../utils/storage');
const events = require('../../utils/events');
const wx = require('../../utils/platform');
const DEBOUNCE = 250;
const REPORT_DELAY = 1000;
Page({
    data: { loading: true, error: '', query: '', hot: [], history: [], recent: [], result: null, wishOpen: false },
    onLoad(options) {
        this.setData({ query: options && options.q ? decodeURIComponent(options.q).slice(0, 30) : '' });
        this.load();
    },
    onShow() { events.page('search'); if (this._station)
        this.refreshLocal(); },
    onUnload() { clearTimeout(this._searchTimer); clearTimeout(this._reportTimer); },
    async load() {
        this.setData({ loading: !this._station, error: '' });
        try {
            this._station = await api.station(false);
            this.setData({ hot: search.hotSearches(this._station) });
            this.refreshLocal();
            if (this.data.query)
                this.run();
        }
        catch (error) {
            this.setData({ error: error.message });
        }
        finally {
            this.setData({ loading: false });
        }
    },
    retry() { this.load(); },
    refreshLocal() { this.setData({ history: storage.searches(), recent: feed.softwareCards(this._station, storage.recent()) }); },
    /** 立即按当前输入计算结果。 */
    run() {
        if (!this._station)
            return null;
        const result = this.data.query.trim() ? search.searchAll(this._station, this.data.query) : null;
        this.setData({ result });
        return result;
    },
    /** 上报搜索词（每个词只报一次，避免边输入边重复计数）。 */
    report() {
        clearTimeout(this._reportTimer);
        const term = this.data.query.trim();
        if (!term || term === this._reported || !this.data.result)
            return;
        this._reported = term;
        events.search(term, this.data.result.total > 0);
    },
    onInput(event) {
        const query = String(event.detail.value || '').slice(0, 30);
        this.setData({ query });
        clearTimeout(this._searchTimer);
        clearTimeout(this._reportTimer);
        this._searchTimer = setTimeout(() => this.run(), DEBOUNCE);
        this._reportTimer = setTimeout(() => this.report(), REPORT_DELAY);
        return query;
    },
    onConfirm() { this.run(); this.report(); storage.pushSearch(this.data.query); this.refreshLocal(); },
    useWord(event) { this.setData({ query: event.currentTarget.dataset.word }); this.onConfirm(); },
    clearQuery() { clearTimeout(this._searchTimer); this.setData({ query: '', result: null }); },
    clearHistory() { storage.clearSearches(); this.refreshLocal(); wx.showToast({ title: '已清空', icon: 'none' }); },
    clearRecent() { storage.clearRecent(); this.refreshLocal(); wx.showToast({ title: '已清空', icon: 'none' }); },
    openSoftware(event) { if (this.data.query.trim())
        storage.pushSearch(this.data.query); wx.navigateTo({ url: c.detailRoute(event.currentTarget.dataset.slug) }); },
    openNotice(event) { if (this.data.query.trim())
        storage.pushSearch(this.data.query); wx.navigateTo({ url: '/pages/announcement/index?slug=' + encodeURIComponent(event.currentTarget.dataset.slug) }); },
    openWish() { this.setData({ wishOpen: true }); },
    closeWish() { this.setData({ wishOpen: false }); }
});
