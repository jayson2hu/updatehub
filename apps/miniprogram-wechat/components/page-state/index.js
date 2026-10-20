// 页面状态：加载骨架 / 错误 + 重试 / 空状态 + 可选操作（UI 规范 §4.11、§6.2）。
// 错误时触发 retry；空状态按钮触发 action（未设置 actionText 时不显示按钮）。
Component({
    properties: {
        loading: Boolean,
        error: String,
        empty: Boolean,
        emptyIcon: { type: String, value: '📭' },
        emptyTitle: { type: String, value: '暂时还没有内容' },
        emptyText: { type: String, value: '' },
        actionText: { type: String, value: '' }
    },
    methods: {
        retry() { this.triggerEvent('retry'); },
        action() { this.triggerEvent('action'); }
    }
});
