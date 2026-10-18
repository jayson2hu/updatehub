// Only this file touches the native SDK. The XHS build substitutes its own SDK and environment.
const sdk = typeof wx !== 'undefined' ? wx : {};
const target = 'wechat';
const buildEnvironment = 'auto';
const bridge = {};
['request','setClipboardData','navigateTo','switchTab','previewImage','pageScrollTo'].forEach(name => {
  bridge[name] = options => {
    if (typeof sdk[name] === 'function') return sdk[name](options);
    if (options?.fail) return options.fail({errMsg:name+': 当前宿主暂不支持'});
    if (typeof sdk.showToast === 'function') sdk.showToast({title:'当前环境暂不支持此操作',icon:'none'});
  };
});
['stopPullDownRefresh','setNavigationBarTitle','showToast'].forEach(name => {bridge[name] = options => {if(typeof sdk[name] === 'function') return sdk[name](options);};});
bridge.getDeviceInfo = () => typeof sdk.getDeviceInfo === 'function' ? sdk.getDeviceInfo() : typeof sdk.getSystemInfoSync === 'function' ? sdk.getSystemInfoSync() : {};
bridge.getAccountInfoSync = () => buildEnvironment !== 'auto' ? {miniProgram:{envVersion:buildEnvironment}} : sdk.getAccountInfoSync();
bridge.showShareMenu = options => {if(typeof sdk.showShareMenu === 'function') sdk.showShareMenu(target === 'xhs' ? {} : options);};
module.exports = bridge;
