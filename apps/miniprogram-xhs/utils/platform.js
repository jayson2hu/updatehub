// Only this file touches the native SDK. The XHS build substitutes its own SDK and environment.
const sdk = typeof xhs !== 'undefined' ? xhs : {};
const target = 'xhs';
const buildEnvironment = 'develop';
const bridge = {};
// 用户可感知的操作：宿主不支持时回调 fail，没有 fail 时给出轻提示。
['request', 'setClipboardData', 'navigateTo', 'switchTab', 'redirectTo', 'reLaunch', 'previewImage', 'pageScrollTo'].forEach(name => {
    bridge[name] = options => {
        if (typeof sdk[name] === 'function')
            return sdk[name](options);
        if (options === null || options === void 0 ? void 0 : options.fail)
            return options.fail({ errMsg: name + ': 当前宿主暂不支持' });
        if (typeof sdk.showToast === 'function')
            sdk.showToast({ title: '当前环境暂不支持此操作', icon: 'none' });
    };
});
// 可选能力：不支持时静默跳过（底栏角标、标题、返回等），核心流程不依赖它们。
['stopPullDownRefresh', 'setNavigationBarTitle', 'showToast', 'navigateBack', 'setTabBarBadge', 'removeTabBarBadge'].forEach(name => {
    bridge[name] = options => {
        if (typeof sdk[name] === 'function')
            return sdk[name](options);
        if (options === null || options === void 0 ? void 0 : options.fail)
            options.fail({ errMsg: name + ': 当前宿主暂不支持' });
    };
});
// 本地存储：同步接口，异常时返回 undefined，由 utils/storage.js 统一兜底到内存。
bridge.getStorageSync = key => (typeof sdk.getStorageSync === 'function' ? sdk.getStorageSync(key) : undefined);
bridge.setStorageSync = (key, value) => { if (typeof sdk.setStorageSync !== 'function')
    throw new Error('storage unavailable'); sdk.setStorageSync(key, value); };
bridge.removeStorageSync = key => { if (typeof sdk.removeStorageSync === 'function')
    sdk.removeStorageSync(key); };
bridge.getDeviceInfo = () => typeof sdk.getDeviceInfo === 'function' ? sdk.getDeviceInfo() : typeof sdk.getSystemInfoSync === 'function' ? sdk.getSystemInfoSync() : {};
bridge.getAccountInfoSync = () => buildEnvironment !== 'auto' ? { miniProgram: { envVersion: buildEnvironment } } : sdk.getAccountInfoSync();
bridge.showShareMenu = options => { if (typeof sdk.showShareMenu === 'function')
    sdk.showShareMenu(target === 'xhs' ? {} : options); };
bridge.pages = () => (typeof getCurrentPages === 'function' ? getCurrentPages() : []);
bridge.target = target;
module.exports = bridge;
