// 公告列表（R-MINI-05 = R-ANN-01/02/04/05）：类型筛选、重要程度色条、已结束变灰并排在后面、关联软件小标签。
const tabPage = require('../../utils/listing-page');
const c = require('../../utils/content');

const TYPES = [{ id: 'all', label: '全部' }, { id: 'group', label: '群公告' }, { id: 'usage', label: '使用提醒' }, { id: 'maintenance', label: '维护通知' }];
const PAGE_SIZE = 20;

Page(tabPage({
  page: 'announcements',
  path: '/pages/announcements/index',
  title: () => '群公告',
  shareTitle: '群公告',
  data: { types: TYPES, category: 'all', notices: [], hasMore: false, limit: PAGE_SIZE },
  render(data) {
    const software = c.visibleSoftware(data).reduce((map, s) => { map[s.id] = s; return map; }, {});
    const list = c.sortAnnouncements((data.announcements || []).filter(n => n.published !== false).map(n => c.announcement(n)))
      .filter(n => this.data.category === 'all' || n.category === this.data.category)
      .map(n => ({ ...n, related: (n.software_ids || []).filter(id => software[id]).map(id => ({ id, text: software[id].name })) }));
    this.setData({ notices: list.slice(0, this.data.limit), hasMore: list.length > this.data.limit });
  },
  methods: {
    onCategory(event) { this.setData({ category: event.currentTarget.dataset.id, limit: PAGE_SIZE }); this.render(); },
    loadMore() { this.setData({ limit: this.data.limit + PAGE_SIZE }); this.render(); },
    clear() { this.setData({ category: 'all', limit: PAGE_SIZE }); this.render(); }
  }
}));
