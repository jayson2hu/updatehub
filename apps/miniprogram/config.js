// 开发者工具内可使用本机接口；真机需改为局域网地址或已备案HTTPS域名。
const wx = require('./utils/platform');
const environments = {
  develop: { apiBase: 'http://127.0.0.1:8010/api/v1', websiteBase: 'http://localhost:3010' },
  trial: { apiBase: '', websiteBase: '' },
  release: { apiBase: '', websiteBase: '' }
};
function getConfig() {
  let version = 'develop';
  try { version = wx.getAccountInfoSync().miniProgram.envVersion || version; } catch (_) { /* 开发工具无账号时使用本地配置。 */ }
  const config = environments[version] || environments.develop;
  if (!config.apiBase || !config.websiteBase) throw new Error('尚未配置小程序服务地址，请管理员填写 config.js 中的 HTTPS 接口与网站域名。');
  return config;
}
module.exports = { getConfig, environments };
