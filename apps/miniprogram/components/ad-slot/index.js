// 广告位（R-AD-01~09）：只在 home_feed（信息流第 3 条后）与 detail_body（详情下载区下方）出现。
// 开关由页面按「总开关 + 位置开关」算好后传入 enabled；左上标注「广告」；✕ 关闭后本次会话不再显示该位置；
// 小程序不能跳外链，点击复制目标链接并上报 ad_click；可见面积 ≥ 50% 持续 1 秒计一次 ad_imp（每次加载每个位置最多一次）。
const wx = require('../../utils/platform');
const api = require('../../utils/api');
const events = require('../../utils/events');
const { safeUrl, asset } = require('../../utils/content');

Component({
  properties: {
    enabled: Boolean,
    promotions: { type: Array, value: [] },
    placement: { type: String, value: 'home_feed' }
  },
  data: { promotion: null, failed: false, closed: false, variant: 'feed' },
  observers: { 'enabled,promotions,placement'() { this.select(); } },
  lifetimes: {
    detached() { clearTimeout(this._timer); clearTimeout(this._impTimer); if (this._observer) this._observer.disconnect(); }
  },
  methods: {
    select() {
      clearTimeout(this._timer);
      const now = Date.now();
      const items = this.data.promotions || [];
      const placement = this.data.placement;
      const closed = Boolean(api.shared().closedAds[placement]);
      const promotion = this.data.enabled && !closed ? items.find(p => p.published !== false && (p.placements || []).includes(placement) && safeUrl(p.target_url) && (!p.starts_at || new Date(p.starts_at).getTime() <= now) && (!p.ends_at || new Date(p.ends_at).getTime() > now)) : null;
      const changed = (promotion && promotion.id) !== (this.data.promotion && this.data.promotion.id);
      // 渲染完成后再开始观察曝光（节点未渲染时 observe 会找不到元素）。
      this.setData({ promotion: promotion ? { ...promotion, cover: asset(promotion.cover_url) } : null, failed: false, closed, variant: placement === 'detail_body' ? 'wide' : 'feed' }, () => { if (changed) this.observe(); });
      // 投放到达开始或结束时间时自动刷新，无需用户重新进入页面。
      if (this.data.enabled) {
        const boundaries = items.reduce((list, p) => list.concat([p.starts_at, p.ends_at]), []).filter(Boolean).map(v => new Date(v).getTime()).filter(t => t > now).sort((a, b) => a - b);
        if (boundaries[0]) this._timer = setTimeout(() => this.select(), Math.min(boundaries[0] - now + 30, 2147483647));
      }
    },
    /** 无法确认可见性时不计曝光，广告展示和点击仍可用。 */
    observe() {
      if (this._observer) { this._observer.disconnect(); this._observer = null; }
      clearTimeout(this._impTimer);
      const promotion = this.data.promotion;
      if (!promotion || this._reported === promotion.id) return;
      if (typeof this.createIntersectionObserver !== 'function') return;
      try {
        this._observer = this.createIntersectionObserver({ thresholds: [0.5] });
        this._observer.relativeToViewport().observe('.ad', result => {
          clearTimeout(this._impTimer);
          if (result.intersectionRatio >= 0.5) this._impTimer = setTimeout(() => this.impression(), 1000);
        });
      } catch (_) { /* Do not invent an impression without visibility evidence. */ }
    },
    impression() {
      const promotion = this.data.promotion;
      if (!promotion || this._reported === promotion.id || this.data.failed || this.data.closed) return;
      this._reported = promotion.id;
      events.adImpression(this.data.placement, promotion.id);
    },
    click() {
      const promotion = this.data.promotion;
      if (!promotion) return;
      wx.setClipboardData({
        data: promotion.target_url,
        success: () => { wx.showToast({ title: '链接已复制，在浏览器打开', icon: 'none', duration: 1900 }); events.adClick(this.data.placement, promotion.id); },
        fail: () => wx.showToast({ title: '复制失败，请稍后再试', icon: 'none' })
      });
    },
    close() {
      clearTimeout(this._impTimer);
      api.shared().closedAds[this.data.placement] = true;
      this.setData({ closed: true });
      if (this._observer) this._observer.disconnect();
    },
    onError() { clearTimeout(this._impTimer); this.setData({ failed: true }); }
  }
});
