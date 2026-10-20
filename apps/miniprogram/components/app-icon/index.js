// 软件图标：有上传图标时显示图片，没有或加载失败时用「首字 + 渐变底」（UI 规范 §2.1）。
// size：sm 36px / md 46px / lg 64px；large 为旧属性，等同 size="lg"。
Component({
  properties: {
    name: { type: String, value: '软件' },
    color: { type: String, value: '#2457E6' },
    src: { type: String, value: '' },
    size: { type: String, value: 'md' },
    large: { type: Boolean, value: false }
  },
  data: { failed: false, initials: '软', sizeClass: 'md' },
  observers: {
    name(value) { this.setData({ initials: (value || '软件').slice(0, 1) }); },
    'size,large'(size, large) { this.setData({ sizeClass: large ? 'lg' : ['sm', 'md', 'lg'].includes(size) ? size : 'md' }); },
    src() { this.setData({ failed: false }); }
  },
  methods: { onError() { this.setData({ failed: true }); } }
});
