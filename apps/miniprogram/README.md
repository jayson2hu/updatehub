# 版本喵 · 小程序共用源码

本目录是微信与小红书小程序的**共用源码**（以微信 WXML / WXSS 为基础）。不要直接导入开发者工具调试发布版本，也不要手改生成目录：

```powershell
npm run mini:build   # 生成 apps/miniprogram-wechat 与 apps/miniprogram-xhs
npm run mini:check   # 7 项发布配置 + 50 项双端逻辑；自动建立隔离临时库/API
node --env-file=.env.miniprogram scripts/build-miniprograms.cjs --env release --check  # 填好配置后只读检查
```

完整说明（页面、本地存储 key、统计事件、配置发布、真机验证清单）见 [小程序开发与发布](../../docs/station-miniprograms.md)，M5 改动与需求对照见 [M5 小程序实现说明](../../docs/v4/m5-小程序实现说明.md)。

## 目录速览

| 路径 | 内容 |
| --- | --- |
| `app.json` / `app.wxss` | 7 个页面、4 项原生底栏、全局组件；v4 蓝色 token 与 `sv-` 公共样式 |
| `pages/latest` `software` `announcements` `me` | 底栏页：首页、软件库、公告、我的 |
| `pages/detail` `announcement` `search` | 软件详情、公告详情、搜索 |
| `components/` | `app-icon`、`copy-link`、`page-state`、`ad-slot`、`sheet`（底部弹层）、`wish-sheet`（想要的软件） |
| `utils/platform.js` | 唯一接触 `wx` / `xhs` SDK 的文件 |
| `utils/api.js` | GET / POST 请求、30 秒站点数据缓存、写后失效 |
| `utils/storage.js` / `events.js` | 本机存储、匿名统计上报 |
| `utils/content.js` / `advice.js` / `feed.js` / `search.js` / `sync.js` | 纯数据计算（WXML 不能调函数，全部在 JS 预计算） |

小程序不能跳外链：所有下载、官网、公告链接一律「复制链接」，用户到浏览器粘贴打开。
