// 我的（R-MINI-07 = R-ME-01~09）：收藏（红点、全部已读）、同步码生成 / 输入恢复（5+5 显示）、常用设备、更新提醒、
// 最近看过、我的反馈、想要的软件、关于 / 隐私 / 免责。所有记录只在本机存储；同步码与网站互通。
const tabPage = require('../../utils/listing-page');
const api = require('../../utils/api');
const c = require('../../utils/content');
const feed = require('../../utils/feed');
const storage = require('../../utils/storage');
const events = require('../../utils/events');
const sync = require('../../utils/sync');
const wx = require('../../utils/platform');

const DEVICES = [{ id: '', text: '自动识别' }].concat(c.platforms.map(p => ({ id: p.id, text: p.emoji + ' ' + p.name })));
const WISH_STATUS = { new: { text: '处理中', tone: 'gray' }, planned: { text: '处理中', tone: 'gray' }, added: { text: '已收录', tone: 'ok' }, rejected: { text: '暂不收录', tone: 'gray' } };
const TEXTS = {
  about: { title: name => '关于' + name, field: 'about_text', fallback: name => `${name}是群友整理的软件更新站：只整理官方信息、更新建议和安装方法，不存放安装包。` },
  privacy: { title: () => '隐私说明', field: 'privacy_text', fallback: () => '不收集个人信息，反馈匿名。收藏、最近看过、常用设备只保存在这台手机上。统计只是按日汇总的次数，不记录 IP 和访客标识，保留 90 天。同步码只包含收藏的软件列表，30 天后删除。' },
  disclaimer: { title: () => '免责声明', field: 'disclaimer_text', fallback: () => '本站只整理软件的官方信息和下载入口，不提供、不存放安装包。请从官方渠道下载，安装前确认来源可靠。' }
};

Page(tabPage({
  page: 'me',
  path: '/pages/latest/index',
  title: () => '我的',
  data: {
    favorites: [], updateCount: 0, stats: [], syncInfo: null, devices: DEVICES, device: '', remind: true, recent: [], feedbacks: [], wishes: [],
    syncOpen: false, syncMode: 'create', created: null, codeInput: '', syncBusy: false, syncError: '', wishOpen: false,
    textOpen: false, textTitle: '', textBody: []
  },
  render(data) {
    if (!this._wishChecked || Date.now() - this._wishChecked > 30000) this.refreshWishes();
    const favorites = feed.favoriteStates(data);
    const feedbacks = storage.feedbackList().map(item => ({ ...item, label: `${item.name || '软件'} ${item.version || ''}`.trim(), platformText: c.labels[item.platform] || '',
      tag: item.verdict === 'ok' ? { text: '能正常用', tone: 'ok' } : { text: '有问题', tone: 'bad' } }));
    const recent = feed.softwareCards(data, storage.recent());
    const saved = storage.syncCode();
    const fingerprint = JSON.stringify([storage.favorites().slice().sort(), storage.device()]);
    const days = saved && saved.fingerprint === fingerprint ? sync.daysLeft(saved.expires_at) : 0;
    this.setData({
      favorites, updateCount: favorites.filter(item => item.isNew).length, recent, feedbacks,
      wishes: storage.wishes().map((item, index) => ({ ...item, key: index, status: WISH_STATUS[item.status] || WISH_STATUS.new })),
      stats: [{ value: favorites.length, label: '收藏' }, { value: recent.length, label: '看过' }, { value: feedbacks.length, label: '反馈' }],
      device: storage.device(), remind: storage.remind(),
      syncInfo: saved && days ? { code: sync.format(saved.code), days } : null
    });
  },
  methods: {
    async refreshWishes() {
      this._wishChecked = Date.now();
      const updates = await Promise.allSettled(storage.wishes().filter(w => w.id).map(async w => ({ ...await api.request('/station/wishes/' + encodeURIComponent(w.id)), id: w.id })));
      const values = updates.filter(r => r.status === 'fulfilled').map(r => r.value);
      if (values.length) { storage.updateWishes(values); this.render(); }
    },
    openWishSoftware(event) { const slug = event.currentTarget.dataset.slug; if (slug) wx.navigateTo({url:c.detailRoute(slug)}); },
    markAllRead() {
      const latest = feed.latestMap(this._station);
      storage.markAllSeen(storage.favorites().reduce((map, id) => { if (latest[id]) map[id] = latest[id]; return map; }, {}));
      wx.showToast({ title: '已全部标为已读', icon: 'none' });
      this.render();
    },
    setDevice(event) {
      storage.setDevice(event.currentTarget.dataset.id);
      wx.showToast({ title: event.currentTarget.dataset.id ? '已设为常用设备' : '已改为自动识别', icon: 'none' });
      this.render();
    },
    /** 更新提醒开关（R-ME-05）：关闭后全站不显示红点、角标与「收藏的软件有更新」。 */
    onRemind(event) { storage.setRemind(Boolean(event.detail.value)); this.render(); },
    planned() { wx.showToast({ title: '即将推出：开启时才需要登录', icon: 'none' }); },

    // ---- 同步码（R-SHEET-05） ----
    openSync(event) { this.setData({ syncOpen: true, syncMode: event.currentTarget.dataset.mode || 'create', syncError: '', created: null, codeInput: '' }); },
    closeSync() { this.setData({ syncOpen: false }); },
    switchSync(event) { this.setData({ syncMode: event.currentTarget.dataset.mode, syncError: '' }); },
    async createCode() {
      const ids = storage.favorites().filter(id => c.visibleSoftware(this._station || {}).some(s => s.id === id));
      if (!ids.length) { this.setData({ syncError: '还没有收藏，先去收藏几个软件吧' }); return null; }
      this.setData({ syncBusy: true, syncError: '' });
      try {
        const old = storage.syncCode();
        const result = await api.post('/station/sync-codes', { software_ids: ids, device: storage.device(), previous_code: old ? old.code : '' });
        storage.setSyncCode({ code: result.code, expires_at: result.expires_at, count: result.software_ids.length, fingerprint: JSON.stringify([ids.slice().sort(),storage.device()]) });
        this.setData({ created: { code: sync.format(result.code), raw: result.code, count: result.software_ids.length, days: sync.daysLeft(result.expires_at) } });
        this.render();
        return result;
      } catch (error) {
        this.setData({ syncError: error.statusCode === 429 ? '生成太频繁，请稍后再试' : error.message });
        return null;
      } finally { this.setData({ syncBusy: false }); }
    },
    /** 输入时自动转大写、忽略空格和短横线，并按 5+5 显示。 */
    onCodeInput(event) { const value = sync.format(event.detail.value); this.setData({ codeInput: value, syncError: '' }); return value; },
    async restoreCode() {
      const code = sync.clean(this.data.codeInput);
      if (!sync.isValid(code)) { this.setData({ syncError: '同步码不对，请检查后重试' }); return null; }
      this.setData({ syncBusy: true, syncError: '' });
      try {
        const result = await api.request('/station/sync-codes/' + encodeURIComponent(code), { notFound: '同步码不对或已过期，请检查后重试；过期的话请在原设备重新生成' });
        // 与本机收藏合并，不覆盖；新增的收藏视为已读，并按 §7.3 上报 fav_add。
        const added = storage.mergeFavorites(result.software_ids, this._station ? feed.latestMap(this._station) : {});
        added.forEach(id => events.favorite(id, true));
        if (!storage.device() && result.device) storage.setDevice(result.device);
        this.setData({ syncOpen: false });
        wx.showToast({ title: `已恢复，新增 ${added.length} 个收藏`, icon: 'none' });
        this.render();
        return added;
      } catch (error) {
        this.setData({ syncError: error.statusCode === 429 ? '尝试太频繁，请稍后再试' : error.message });
        return null;
      } finally { this.setData({ syncBusy: false }); }
    },

    openWish() { this.setData({ wishOpen: true }); },
    closeWish() { this.setData({ wishOpen: false }); this.render(); },
    openText(event) {
      const kind = TEXTS[event.currentTarget.dataset.kind] || TEXTS.about;
      const name = this.data.siteName;
      const text = (this.data.settings && this.data.settings[kind.field]) || kind.fallback(name);
      this.setData({ textOpen: true, textTitle: kind.title(name), textBody: String(text).split('\n').map(t => t.trim()).filter(Boolean) });
    },
    closeText() { this.setData({ textOpen: false }); },
    openLibrary() { wx.switchTab({ url: '/pages/software/index' }); }
  }
}));
