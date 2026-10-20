// 「想要的软件」弹层（R-SHEET-06）：名称必填 2–30 字、设备可多选、用途选填 ≤ 50 字。
// 同一台设备对同一名称只提交一次（本机记录）；成功后写入「我的 → 想要的软件」。
const api = require('../../utils/api');
const storage = require('../../utils/storage');
const { platforms } = require('../../utils/content');
const wx = require('../../utils/platform');

const DEVICE_CHIPS = platforms.map(p => ({ id: p.id, text: p.emoji + ' ' + p.label, on: false }));

Component({
  properties: {
    show: { type: Boolean, value: false },
    name: { type: String, value: '' }
  },
  data: { value: '', note: '', devices: DEVICE_CHIPS, submitting: false, canSubmit: false, error: '' },
  observers: {
    'show,name'(show, name) { if (show) this.reset(name); }
  },
  methods: {
    reset(name) {
      const value = String(name || '').trim().slice(0, 30);
      this.setData({ value, note: '', devices: DEVICE_CHIPS.map(d => ({ ...d, on: false })), submitting: false, error: '', canSubmit: value.length >= 2 });
    },
    onName(event) { const value = event.detail.value.slice(0, 30); this.setData({ value, canSubmit: value.trim().length >= 2, error: '' }); return value; },
    onNote(event) { const note = event.detail.value.slice(0, 50); this.setData({ note }); return note; },
    toggleDevice(event) {
      const id = event.currentTarget.dataset.id;
      this.setData({ devices: this.data.devices.map(d => (d.id === id ? { ...d, on: !d.on } : d)) });
    },
    close() { if (this.triggerEvent) this.triggerEvent('close'); },
    async submit() {
      const name = this.data.value.trim();
      if (name.length < 2 || this.data.submitting) { this.setData({ error: '软件名称至少 2 个字' }); return false; }
      if (storage.hasWish(name)) {
        wx.showToast({ title: '你已经提交过这个软件了', icon: 'none' });
        this.close();
        return false;
      }
      const chosen = this.data.devices.filter(d => d.on).map(d => d.id);
      this.setData({ submitting: true, error: '' });
      try {
        const receipt = await api.post('/station/wishes', { name, platforms: chosen, note: this.data.note.trim() }, { invalidate: false });
        storage.addWish({ id: receipt && receipt.id, name, platforms: chosen, note: this.data.note.trim(), votes: (receipt && receipt.votes) || 1, status: (receipt && receipt.status) || 'new' });
        wx.showToast({ title: '已提交，收录后会在“我的”里显示', icon: 'none', duration: 1900 });
        if (this.triggerEvent) this.triggerEvent('submitted', { name });
        this.close();
        return true;
      } catch (error) {
        this.setData({ error: error.message });
        wx.showToast({ title: error.statusCode === 429 ? '提交太频繁，请稍后再试' : '提交失败，请稍后再试', icon: 'none' });
        return false;
      } finally {
        this.setData({ submitting: false });
      }
    }
  }
});
