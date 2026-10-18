# ADR-0004 设备存储值保留 `desktop`

- 状态：已采纳（2026-10-18）

## 背景
设计稿使用 `pc`；现有存储值为 `android/ios/tv/desktop`，已分享出去的链接带 `platform=desktop`，小程序筛选也依赖此取值。

## 决策
存储与 URL 继续使用 `desktop`，界面显示"电脑"。

## 后果
旧分享链接继续有效，无需数据迁移。
