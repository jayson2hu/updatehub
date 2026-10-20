const { getConfig } = require('../config');
const wx = require('./platform');
const CACHE_MS = 30000;
const fallbackState = {};
// 全局共享状态（站点数据缓存、本次会话关闭的广告、跨 tab 传递的分类）。
function shared() {
    const app = typeof getApp === 'function' ? getApp() : null;
    const state = (app && app.globalData) || fallbackState;
    if (state.station === undefined)
        state.station = null;
    if (!state.fetchedAt)
        state.fetchedAt = 0;
    if (!state.stationVersion)
        state.stationVersion = 0;
    if (!state.closedAds)
        state.closedAds = {};
    return state;
}
function detailText(data) {
    const detail = data && data.detail;
    if (typeof detail === 'string')
        return detail;
    // FastAPI 校验错误为数组，只取第一条可读信息。
    if (Array.isArray(detail) && detail[0] && typeof detail[0].msg === 'string')
        return detail[0].msg.replace(/^Value error, /, '');
    return '';
}
function errorFor(response, options) {
    const status = response.statusCode;
    if (status === 404)
        return options.notFound || '内容不存在或已下架，请返回列表查看最新内容。';
    if (status === 429)
        return '操作太频繁，请稍后再试。';
    if (status === 403)
        return detailText(response.data) || '请求来源不受信任，请从小程序内重新打开。';
    return detailText(response.data) || (options.method === 'POST' ? '提交失败，请稍后再试。' : '内容暂时没有加载成功，请下拉刷新或重试。');
}
/**
 * 请求公开接口。
 * options.method：GET（默认）/ POST；options.data：JSON 请求体；options.notFound：404 时的说明。
 * 失败时 reject 的 Error 带有 statusCode，便于页面区分限流、不存在等情况。
 */
function request(path, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    return new Promise((resolve, reject) => {
        let config;
        try {
            config = getConfig();
        }
        catch (error) {
            reject(error);
            return;
        }
        const task = { url: config.apiBase + path, method, timeout: 12000,
            success(response) {
                if (response.statusCode >= 200 && response.statusCode < 300)
                    resolve(response.statusCode === 204 ? null : response.data);
                else {
                    const error = new Error(errorFor(response, Object.assign(Object.assign({}, options), { method })));
                    error.statusCode = response.statusCode;
                    reject(error);
                }
            },
            fail() { const error = new Error(method === 'GET' ? '暂时连接不上小站，请检查网络后重试。开发预览请确认接口已启动、服务域名配置正确。' : '网络不太好，提交没有成功，请稍后再试。'); error.statusCode = 0; reject(error); } };
        if (options.data !== undefined) {
            task.data = options.data;
            task.header = { 'content-type': 'application/json' };
        }
        wx.request(task);
    });
}
/** 让站点数据缓存失效；stationVersion 变化后，各页面 onShow 时会重新拉取。 */
function invalidate() {
    const state = shared();
    state.station = null;
    state.fetchedAt = 0;
    state.stationVersion += 1;
}
/**
 * 匿名写入（反馈、想要的软件、同步码）。写请求从不读缓存；
 * invalidate 为 true 时成功后让 /station/data 缓存失效（如反馈会改变能用率）。
 */
function post(path, data, options = {}) {
    return request(path, Object.assign(Object.assign({}, options), { method: 'POST', data })).then(result => {
        if (options.invalidate)
            invalidate();
        return result;
    });
}
let pending = null;
/** 读取 /station/data，30 秒内复用缓存；并发调用共用同一个请求。 */
function station(force) {
    const state = shared();
    if (!force && state.station && Date.now() - state.fetchedAt < CACHE_MS)
        return Promise.resolve(state.station);
    if (pending)
        return pending;
    // 不用 Promise.prototype.finally：部分旧基础库没有该方法。
    pending = request('/station/data').then(data => {
        pending = null;
        state.station = data;
        state.fetchedAt = Date.now();
        return data;
    }, error => { pending = null; throw error; });
    return pending;
}
module.exports = { request, post, station, invalidate, shared, CACHE_MS };
