// 软件库（R-MINI-03 = R-LIB-01~04）：分类 chips、排序（最近更新 / 最多人看）、两列卡片、收藏星标、空状态提交想要的软件。
const tabPage = require('../../utils/listing-page');
const feed = require('../../utils/feed');
const storage = require('../../utils/storage');
const events = require('../../utils/events');
const api = require('../../utils/api');
const wx = require('../../utils/platform');

const SORTS = [{ id: 'recent', text: '最近更新' }, { id: 'popular', text: '最多人看' }];

Page(tabPage({
  page: 'library',
  path: '/pages/software/index',
  title: () => '软件库',
  shareTitle: '软件库',
  data: { chips: feed.categoryChips(), category: 'all', sorts: SORTS, sort: 'recent', software: [], hasDemo: false, wishOpen: false },
  onShow() {
    // 首页分类宫格通过全局状态传入分类（switchTab 不能带参数）。
    const state = api.shared();
    // 随后由 tabPage 的 onShow 统一重新渲染。
    if (state.pendingCategory) { this.setData({ category: state.pendingCategory }); state.pendingCategory = ''; }
  },
  render(data) {
    this.setData({ software: feed.libraryList(data, { category: this.data.category, sort: this.data.sort }), hasDemo: data.software.some(s => s.is_demo) });
  },
  methods: {
    onCategory(event) { this.setData({ category: event.currentTarget.dataset.id }); this.render(); },
    onSort(event) { this.setData({ sort: event.currentTarget.dataset.id }); this.render(); },
    /** 收藏星：只切换收藏，不进入详情（模板里用 catchtap 阻止冒泡）。 */
    toggleFavorite(event) {
      const id = event.currentTarget.dataset.id;
      const item = this.data.software.find(s => s.id === id);
      if (!item) return;
      const added = storage.toggleFavorite(id, item.latestAt);
      events.favorite(id, added);
      wx.showToast({ title: added ? '已收藏，有新版本会提醒你' : '已取消收藏', icon: 'none' });
      this.render();
    },
    openWish() { this.setData({ wishOpen: true }); },
    closeWish() { this.setData({ wishOpen: false }); }
  }
}));
