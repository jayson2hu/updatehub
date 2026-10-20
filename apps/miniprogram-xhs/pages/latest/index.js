// 首页（R-MINI-02 = R-HOME-01/03/04/05/06/07/08）：本周概览、公告横滑、收藏有更新、分类宫格、最新更新信息流、本周热门。
const tabPage = require('../../utils/listing-page');
const c = require('../../utils/content');
const feed = require('../../utils/feed');
const storage = require('../../utils/storage');
const api = require('../../utils/api');
const wx = require('../../utils/platform');
const DEVICE_CHIPS = [{ id: 'all', text: '全部设备' }].concat(c.platforms.map(p => ({ id: p.id, text: p.emoji + ' ' + p.label })));
Page(tabPage({
    page: 'home',
    path: '/pages/latest/index',
    title: name => name,
    data: { week: null, notices: [], favUpdates: [], categories: [], devices: DEVICE_CHIPS, platform: 'all', items: [], total: 0, hasMore: false,
        limit: feed.PAGE_SIZE, hot: [], adsEnabled: false, promotions: [], hasDemo: false, footerNote: '' },
    render(data) {
        const result = feed.feedItems(data, { platform: this.data.platform, limit: this.data.limit });
        this.setData({
            week: feed.weekStats(data),
            notices: feed.activeAnnouncements(data),
            favUpdates: feed.favoriteStates(data).filter(item => item.isNew),
            categories: feed.categoryGrid(data),
            items: result.items, total: result.total, hasMore: result.hasMore,
            hot: feed.hotList(data),
            adsEnabled: feed.adEnabled(data.settings, 'home_feed'),
            promotions: data.promotions || [],
            hasDemo: c.visibleSoftware(data).some(s => s.is_demo),
            footerNote: (data.settings && data.settings.footer_note) || ''
        });
    },
    methods: {
        /** 设备筛选：只刷新列表，不改滚动位置。 */
        onPlatform(event) { this.setData({ platform: event.currentTarget.dataset.id, limit: feed.PAGE_SIZE }); this.render(); },
        loadMore() { this.setData({ limit: this.data.limit + feed.PAGE_SIZE }); this.render(); },
        /** 全部已读（R-HOME-04）：所有收藏按当前最新版本标记已读。 */
        markAllRead() {
            if (!this._station)
                return;
            const latest = feed.latestMap(this._station);
            storage.markAllSeen(storage.favorites().reduce((map, id) => { if (latest[id])
                map[id] = latest[id]; return map; }, {}));
            wx.showToast({ title: '已全部标为已读', icon: 'none' });
            this.render();
        },
        /** 分类宫格：switchTab 不能带参数，借全局状态把分类交给软件库页。 */
        openCategory(event) { api.shared().pendingCategory = event.currentTarget.dataset.id; wx.switchTab({ url: '/pages/software/index' }); },
        openLibrary() { wx.switchTab({ url: '/pages/software/index' }); },
        allNotices() { wx.switchTab({ url: '/pages/announcements/index' }); }
    }
}));
