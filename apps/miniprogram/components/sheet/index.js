// 底部弹层（R-SHEET-01，UI 规范 §4.9）：遮罩 + 抓手 + 标题 + 说明 + 可滚动内容（slot）。
// 点遮罩或「✕」触发 close，由页面决定是否关闭；遮罩拦截 touchmove，打开期间页面不跟着滚动。
Component({
  options: { multipleSlots: true, addGlobalClass: true },
  properties: {
    show: { type: Boolean, value: false },
    title: { type: String, value: '' },
    desc: { type: String, value: '' }
  },
  methods: {
    close() { if (this.triggerEvent) this.triggerEvent('close'); },
    noop() {}
  }
});
