// 复制按钮：小程序不能跳外链，下载、官网、公告链接一律复制（R-MINI-04）。
// 成功：平台原生 toast（文案由 toast 属性指定）并触发 copied 事件，页面据此上报 dl_copy；
// 失败：toast「复制失败，请长按文字手动复制」并弹出可长按选择的完整文本（R-GLOBAL-07）。
const wx = require('../../utils/platform');
Component({
  properties: {
    value: { type: String, value: '' },
    label: { type: String, value: '复制链接' },
    toast: { type: String, value: '已复制' },
    primary: { type: Boolean, value: false },
    soft: { type: Boolean, value: false },
    block: { type: Boolean, value: false },
    large: { type: Boolean, value: false },
    small: { type: Boolean, value: false },
    disabledText: { type: String, value: '' }
  },
  data: { manual: false, copied: false },
  observers: { value() { this.setData({ copied: false, manual: false }); } },
  methods: {
    copy() {
      const value = this.data.value;
      if (!value) return;
      wx.setClipboardData({
        data: value,
        success: () => {
          this.setData({ copied: true });
          wx.showToast({ title: this.data.toast || '已复制', icon: 'none', duration: 1900 });
          if (this.triggerEvent) this.triggerEvent('copied', { value });
        },
        fail: () => {
          this.setData({ manual: true });
          wx.showToast({ title: '复制失败，请长按文字手动复制', icon: 'none', duration: 1900 });
        }
      });
    },
    close() { this.setData({ manual: false }); },
    stop() {}
  }
});
