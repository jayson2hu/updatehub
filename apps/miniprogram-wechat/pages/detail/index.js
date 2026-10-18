const api = require('../../utils/api');
const c = require('../../utils/content');
const wx = require('../../utils/platform');
Page({
    data: { loading: true, error: '', software: null, platforms: [], platform: '', platformName: '', releases: [], release: null, selectedIndex: 0, primary: null, backups: [], noLink: '暂未配置获取链接', notices: [], history: [], historyOpen: false, faqs: [], websiteLink: '', copyLabel: '复制获取链接', screenshots: [], adsEnabled: false, promotions: [] },
    onLoad(options) { this._active = true; this._options = options; this.load(); api.station(false).then(data => { if (this._active)
        this.setData({ adsEnabled: data.settings.ads_enabled, promotions: data.promotions || [] }); }).catch(() => { }); },
    onUnload() { this._active = false; },
    async load() { var _a, _b; this.setData({ loading: !this.data.software, error: '' }); try {
        if (!((_a = this._options) === null || _a === void 0 ? void 0 : _a.slug))
            throw new Error('软件链接不完整，请返回软件目录选择。');
        const data = await api.request('/station/software/' + encodeURIComponent(this._options.slug));
        this._detail = data;
        this._releases = data.releases.filter(r => r.published !== false).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
        let device = 'android';
        try {
            if (wx.getDeviceInfo().platform === 'ios')
                device = 'ios';
        }
        catch (_) { }
        const shared = this._releases.find(r => r.id === this._options.release && (!this._options.platform || r.platform === this._options.platform));
        const initial = data.software.platforms.includes(this.data.platform) ? this.data.platform : data.software.platforms.includes(this._options.platform) ? this._options.platform : (shared === null || shared === void 0 ? void 0 : shared.platform) || (data.software.platforms.includes(device) ? device : data.software.platforms[0]);
        this.setData({ software: c.appItem(data.software), platforms: c.platforms.filter(p => data.software.platforms.includes(p.id)), faqs: (data.software.faqs || []).map(f => (Object.assign(Object.assign({}, f), { open: false }))), screenshots: (data.software.screenshots || []).map(c.asset), notices: data.announcements.map(c.announcement).filter(n => !n.ended && n.importance !== 'normal') });
        this.choose(initial, ((_b = this.data.release) === null || _b === void 0 ? void 0 : _b.id) || (shared === null || shared === void 0 ? void 0 : shared.id));
        wx.setNavigationBarTitle({ title: data.software.name });
        wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    }
    catch (error) {
        this.setData({ error: error.message });
    }
    finally {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
    } },
    onPullDownRefresh() { this.load(); }, retry() { this.load(); },
    choose(platform, releaseId) { const choices = this._releases.filter(r => r.platform === platform).map((r, i) => (Object.assign(Object.assign({}, r), { label: `v${r.version}${i === 0 ? ' · 最新版' : ' · 历史版'} · ${c.date(r.published_at)}` }))); const index = Math.max(0, choices.findIndex(r => r.id === releaseId)); const raw = choices[index]; const state = c.releaseState(this._detail.software, raw); const release = raw ? Object.assign(Object.assign(Object.assign({}, raw), state), { date: c.date(raw.published_at), paragraphs: (raw.notes || '').split('\n').filter(Boolean), latest: index === 0 }) : null; const links = state.status === 'unavailable' ? [] : ((raw === null || raw === void 0 ? void 0 : raw.links) || []).filter(l => c.safeUrl(l.url)).map(l => (Object.assign(Object.assign({}, l), { source: l.label || l.url.replace(/^https?:\/\//, '').split('/')[0] }))); const primary = links.find(l => l.is_primary) || links[0] || null; const suffix = `/software/${encodeURIComponent(this._detail.software.slug)}?platform=${encodeURIComponent(platform)}${release ? '&release=' + encodeURIComponent(release.id) : ''}`; this.setData({ platform, platformName: c.names[platform], releases: choices, release, selectedIndex: index, primary, backups: links.filter(l => l !== primary), history: choices.slice(1), websiteLink: c.webLink(suffix), noLink: state.status === 'unavailable' ? state.reason || '当前版本暂时无法使用，恢复后会在本站公告。' : '暂未配置获取链接，请等待管理员补充。', copyLabel: '复制' + c.labels[platform] + '版获取链接' }); },
    onPlatform(event) { this.choose(event.currentTarget.dataset.id); }, onVersion(event) { var _a; this.choose(this.data.platform, (_a = this.data.releases[Number(event.detail.value)]) === null || _a === void 0 ? void 0 : _a.id); },
    toggleHistory() { this.setData({ historyOpen: !this.data.historyOpen }); }, selectHistory(event) { this.choose(this.data.platform, event.currentTarget.dataset.id); wx.pageScrollTo({ selector: '#version', duration: 0 }); },
    toggleFaq(event) { const index = Number(event.currentTarget.dataset.index); this.setData({ [`faqs[${index}].open`]: !this.data.faqs[index].open }); },
    openNotice(event) { wx.navigateTo({ url: '/pages/announcement/index?slug=' + encodeURIComponent(event.currentTarget.dataset.slug) }); },
    preview(event) { wx.previewImage({ urls: this.data.screenshots, current: event.currentTarget.dataset.src }); },
    onShareAppMessage() { var _a, _b; return { title: (((_a = this.data.software) === null || _a === void 0 ? void 0 : _a.name) || '软件详情') + ' · ' + this.data.platformName + (this.data.release ? ' v' + this.data.release.version : ''), path: c.detailRoute(this._options.slug, this.data.platform, (_b = this.data.release) === null || _b === void 0 ? void 0 : _b.id) }; },
    onShareTimeline() { const share = this.onShareAppMessage(); return { title: share.title, query: share.path.split('?')[1] || '' }; }
});
