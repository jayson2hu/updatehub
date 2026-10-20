// 全局状态：站点数据缓存（utils/api.js 维护）、本次会话关闭的广告位、首页分类宫格跳转软件库时携带的分类。
const events = require('./utils/events');
App({
    globalData: { station: null, fetchedAt: 0, stationVersion: 0, closedAds: {}, pendingCategory: '' },
    // 切到后台时把还没发出的统计一次发完。
    onHide() { events.flush(); }
});
