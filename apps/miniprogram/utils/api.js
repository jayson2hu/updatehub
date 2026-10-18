const { getConfig } = require('../config');
const wx = require('./platform');
function request(path) {
  return new Promise((resolve, reject) => {
    let config;
    try { config = getConfig(); } catch (error) { reject(error); return; }
    wx.request({ url: config.apiBase + path, method: 'GET', timeout: 12000,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300) resolve(response.data);
        else reject(new Error(response.statusCode === 404 ? '内容不存在或已下架，请返回列表查看最新内容。' : typeof response.data?.detail === 'string' ? response.data.detail : '内容暂时没有加载成功，请下拉刷新或重试。'));
      },
      fail() { reject(new Error('暂时连接不上小站，请检查网络后重试。开发预览请确认接口已启动、服务域名配置正确。')); }
    });
  });
}
async function station(force) {
  const app = getApp();
  if (!force && app.globalData.station && Date.now() - app.globalData.fetchedAt < 30000) return app.globalData.station;
  const data = await request('/station/data');
  app.globalData.station = data;
  app.globalData.fetchedAt = Date.now();
  return data;
}
module.exports = { request, station };
