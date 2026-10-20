# 版本喵 · 微信与小红书小程序

两个原生小程序共用网站的公开接口、内容数据库、管理员发布与上传目录。访客免登录；小程序内不开放管理操作，也不打包管理员凭据或 AppSecret。站名、热门搜索词、广告开关、说明文字都来自后台「站点设置」，改完不需要重新发布小程序。

本文是开发、构建、验证与发布手册。v4（M5）的改动清单与需求编号对照见 [`docs/v4/m5-小程序实现说明.md`](v4/m5-小程序实现说明.md)。

## 1 项目目录

| 路径 | 用途 | 导入工具 |
| --- | --- | --- |
| `apps/miniprogram` | 共用源码，以微信 WXML / WXSS 为基础 | 只改这里 |
| `apps/miniprogram-wechat` | 构建产物：WXML / WXSS / JS | 微信开发者工具 |
| `apps/miniprogram-xhs` | 构建产物：XHSML / CSS / JS | 小红书开发者工具 |
| `scripts/build-miniprograms.cjs` | 双端构建、模板转换、SDK 适配、ES2017 转译、CSS 变量内联、产物校验 | Node.js 22+ |
| `tests/miniprogram.test.cjs` | 对两份产物跑页面逻辑（连本机 API） | `npm run mini:check` |

修改共用源码后运行 `npm run mini:build` 同步两个项目，**不要分别修改两份生成代码**（下次构建会被覆盖）。构建会：

- 小红书：`.wxml → .xhsml`、`.wxss → .css`、`wx: → xhs:`，`utils/platform.js` 改用 `xhs` SDK；把 `app.wxss` 中 `page{}` 定义的 `--sv-*` 变量替换为常量（小红书基础库对 CSS 变量的支持未确认）；全局组件写入每个页面的 `usingComponents`；去掉 `style`、`lazyCodeLoading`、`sitemapLocation`。
- 两端：JS 转译为 ES2017；复制图片资源（png / jpg / gif / webp / svg）；清理上一版遗留、本次未生成的文件（保留开发者工具写入的 `project.config.json`、`project.private.config.json`）。
- 构建后自检：每个页面与组件（含嵌套组件）都有 `.js/.json/模板/样式` 四个文件、底栏页面已声明、底栏图标存在、所有 JSON 合法；不通过时构建直接失败。
- 已有 AppID 在重新构建时保留；环境变量 `MINIAPP_WECHAT_APP_ID` / `MINIAPP_XHS_APP_ID` 优先。

## 2 本地运行

1. 按 `docs/station-operations.md` 启动现有 API（8010）与网站（3010）。
2. 仓库根目录运行 `npm run mini:build`。
3. 微信开发者工具导入 `apps/miniprogram-wechat`，填写自己的微信 AppID；小红书开发者工具导入 `apps/miniprogram-xhs`，填写拥有开发权限的小红书 AppID。
4. 本地开发使用 `http://127.0.0.1:8010/api/v1`；仅在本地工具中关闭「合法域名 / TLS / HTTPS 证书」校验。
5. 手机扫码预览要用可访问的测试 HTTPS 服务，不能沿用手机上的 `127.0.0.1`。

正式环境匿名写请求必须带可信站点来源，或匹配 `MINIAPP_REFERER_PREFIXES` 的原生 HTTPS Referer。该变量按微信/小红书实际 AppID 请求设置精确前缀，以 `/` 结尾，多项逗号分隔；未配置时不能把本地开发可用视为正式环境已联通。不要伪造来源或改成全放行。开发环境允许本机工具调试；限流地址只保存在进程内存。

## 3 页面

底栏 4 项用 `app.json` 原生 `tabBar`（两端都提供该能力，见 §8 说明），图标为 81×81 PNG，选中 `#2457E6`、未选中 `#626F84`。

| 页面 | 路径 | 底栏 | 主要内容（需求编号） |
| --- | --- | --- | --- |
| 首页 | `pages/latest/index` | 首页 | 本周概览与伪搜索框、群公告横滑、收藏的软件有更新、分类宫格、最新更新（设备筛选、日期分组、多设备合并、旧版→新版、建议标签、能用比例、第 3 条后广告、加载更多）、本周热门（R-MINI-02） |
| 软件库 | `pages/software/index` | 软件库 | 搜索入口、分类 chips、排序（最近更新 / 最多人看）、两列卡片、收藏星、空分类提交想要的软件（R-MINI-03） |
| 公告 | `pages/announcements/index` | 公告 | 类型筛选、重要程度色条、置顶、已结束变灰排后、关联软件（R-MINI-05） |
| 我的 | `pages/me/index` | 我的 | 收藏（红点、全部已读）、同步码生成 / 恢复、常用设备、更新提醒、最近看过、我的反馈、想要的软件、关于 / 隐私 / 免责（R-MINI-07） |
| 软件详情 | `pages/detail/index?slug=&platform=&release=` | — | 头部收藏 / 分享、关键数字、结论条、设备与版本选择、复制下载链接、5 个分段、反馈、相关公告、大家还在看、底部操作条（R-MINI-04） |
| 公告详情 | `pages/announcement/index?slug=` | — | 已结束提示、元信息、正文与配图、外链复制、相关软件、复制公告链接（R-MINI-05） |
| 搜索 | `pages/search/index?q=` | — | 大家在搜、搜索历史、最近看过、即时结果与高亮、搜不到提交想要的软件（R-MINI-06） |

导航栏标题：首页为站名（`settings.site_name`，冷启动先用本机缓存的站名，默认「版本喵」），其余为页面名或软件名。`app.json` 不再写死站名。

## 4 组件

| 组件 | 用途 |
| --- | --- |
| `app-icon` | 软件图标；无图或加载失败时「首字 + 渐变底」；`size` = sm / md / lg |
| `copy-link` | 复制按钮。成功：原生 toast（文案可配）并触发 `copied` 事件；失败：toast「复制失败，请长按文字手动复制」并弹出可长按选择的完整文本 |
| `page-state` | 加载骨架 / 错误 + 重试 / 空状态 + 可选操作按钮 |
| `ad-slot` | 广告位（`home_feed`、`detail_body`）；左上「广告」；✕ 关闭后本次会话不再显示；点击复制目标链接；可见 50% 持续 1 秒计曝光 |
| `sheet` | 底部弹层：遮罩、抓手、标题、说明、可滚动内容；点遮罩或 ✕ 关闭；遮罩阻止页面滚动 |
| `wish-sheet` | 「想要什么软件？」表单（名称 2–30 字、设备多选、用途 ≤ 50 字），同名本机只提交一次 |

toast 统一用平台原生 `showToast({icon:'none'})`。

## 5 外链处理

小程序不能跳转任意外链，也不使用需要额外资质与业务域名的 `web-view`。所有下载、官网、公告外链一律**复制**：

- 主按钮「⬇ 复制{设备}版下载链接」；旧版「⬇ 复制{设备}版 x.y.z 下载链接」；`hold` 时「⬇ 复制稳定版 x.y.z 下载链接」并附「仍要复制 x 链接」；苹果「⬇ 复制 App Store 链接」并提示可在 App Store 搜索软件名。
- 主按钮使用稳定版时，包大小、系统要求和安装提醒也取稳定版。稳定版没有官方链接时显示「查看稳定版 x.y.z 入口」，切换到该版本查看备用入口，不把问题版当作默认下载。旧版遇到最新版为 `hold` 时，提示先查看更新建议。
- 有提取码时：主链接与提取码分开复制（「复制提取码」，toast「提取码已复制」）；备用网盘另有「复制链接和提取码」（复制「{链接} 提取码 {code}」）。
- 成功 toast「链接已复制，请到浏览器粘贴打开」；复制计为一次下载点击（`dl_copy`）。
- `unavailable` 的版本不提供它自身的获取入口；若有可用稳定版，主按钮改为复制稳定版，或在缺链接时查看稳定版入口。没有可用稳定版和链接时，按钮禁用并说明原因。

## 6 本地存储 key

全部通过 `utils/storage.js` 读写（底层 `wx/xhs.getStorageSync`），存储不可用时退回内存，页面照常可用。

| key | 类型 | 内容 |
| --- | --- | --- |
| `bm.favorites` | `string[]` | 收藏的软件 id，最新在前 |
| `bm.seen` | `{id: ISO 时间}` | 上次查看时该软件最新版本的发布时间；最新发布时间更晚即「有新版」（红点、角标） |
| `bm.recent` | `string[]` | 最近看过的软件 id，最多 6 个 |
| `bm.device` | `'' \| android \| ios \| tv \| desktop` | 常用设备，`''` 为自动识别 |
| `bm.feedback` | `{releaseId: {verdict, receipt, kind, softwareId, slug, name, version, platform, at}}` | 本机反馈及签名改投凭据（每版本一票，最多 200 条） |
| `bm.searches` | `string[]` | 搜索历史，最多 10 条 |
| `bm.wishes` | `[{id, name, platforms, note, votes, status, software_slug, at}]` | 请求 ID 保持稳定，后台合并/收录后刷新状态和公开入口 |
| `bm.remind` | `boolean` | 更新提醒开关，默认开；关掉后不显示红点、角标与「收藏的软件有更新」 |
| `bm.sync` | `{code, expires_at, count, fingerprint}` | 指纹比较完整收藏集合与常用设备，数量相同也不能误用旧码 |
| `bm.siteName` | `string` | 最近一次读到的站名，冷启动时先显示 |
| `bm.eventDays` | `{day, keys}` | 统计事件当天去重记录（北京时间） |

## 7 统计事件

`utils/events.js` 批量上报到 `POST /station/events`（合并 1.5 秒内的事件，单批 ≤ 30 条，切后台时立即发送），失败静默丢弃，不带任何访客标识。

| 事件 | key | 触发 |
| --- | --- | --- |
| `page_view` | `home` / `library` / `announcements` / `me` / `detail` / `announcement` / `search` | 每次页面显示（onShow） |
| `sw_view` | 软件 id | 打开软件详情；**同一软件每天只报一次**（本机北京时间去重） |
| `release_view` | 版本 id | 选中该版本，每日一次；不与软件浏览混用 |
| `ann_view` | 公告 id | 打开公告详情；每天一次 |
| `dl_copy` | 版本 id | 复制主下载链接、稳定版、仍要复制、备用链接、提取码成功 |
| `fav_add` / `fav_remove` | 软件 id | 收藏 / 取消收藏；同步码恢复新增的收藏也报 `fav_add` |
| `search` / `search_miss` | 搜索词（≤ 30 字） | 停止输入 1 秒或回车，每个词报一次 |
| `ad_imp` / `ad_click` | `placement:promotionId` | 广告可见 50% 持续 1 秒 / 点击复制链接 |

## 8 平台差异与取舍

- **底栏**：两端都用原生 `tabBar`。微信原生支持 `setTabBarBadge`；小红书通过 `utils/platform.js` 做存在性检查，不支持时静默不显示角标（R-MINI-01 允许）。如果小红书开发者工具里原生 tabBar 表现异常，再改为自定义 tabBar 组件——本期未发现需要这样做的依据，原生 tabBar 的性能、无障碍与安全区处理都更好。
- **顶栏**：使用原生导航栏；详情页的「收藏 / 分享」放在头部右侧。从分享卡片直接进入详情时，微信会自动显示「返回首页」按钮。
- **分享**：微信 `onShareAppMessage`（群 / 好友，标题含版本号与建议）与 `onShareTimeline`；小红书调用 `showShareMenu({})` 并保留同样的分享路径。分享弹层另有「复制链接」「复制群文案」。海报（P2）未做。
- **不显示**：小红书内打开提示条与引导弹层、二维码扫码下载、「群主后台」入口（R-MINI-10）。
- **CSS 变量**：微信直接使用 `var(--sv-*)`；小红书构建时替换为常量。

## 9 配置与部署

复制 `.env.miniprogram.example` 为 `.env.miniprogram`，填写两个公开 AppID、API 与网站地址。该本地文件被忽略，不提交密钥。

```powershell
# 本地开发两个项目
npm run mini:build

# 单独更新小红书开发项目
npm run mini:build -- --target xhs

# 只检查正式配置，不改动任何生成文件，也不上传代码
node --env-file=.env.miniprogram scripts/build-miniprograms.cjs --env release --check

# 读取本地配置，生成体验版；两个地址都必须为真实 HTTPS 域名
node --env-file=.env.miniprogram scripts/build-miniprograms.cjs --env trial

# 生成正式版
node --env-file=.env.miniprogram scripts/build-miniprograms.cjs --env release
```

微信与小红书后台分别配置 `request` 合法域名及图片 `downloadFile` 域名；核实域名证书、账号、类目要求，并为 API 配置精确 `MINIAPP_REFERER_PREFIXES`。构建不会上传或发布代码。体验/正式构建缺失 HTTPS、空/游客 AppID 或使用本机地址时，在写入产物前失败；未知、重复或缺值参数也直接报错。地址须为完整基础地址，不允许账号密码、查询参数和片段；网站必须为根地址，API 可包含反向代理前缀并以 `/api/v1` 结尾，尾部 `/` 自动去掉。错误不回显原地址中的敏感内容。

`--check` 只验证本地配置并显示标准化后的服务地址，成功不代表 AppID 归属、合法域名、HTTPS 证书、网络连通或原生编译已通过。两个平台的配置在任何产物写入前共同检查。内容更新无需重新发小程序：后台发布后，群友下拉刷新即可。

2026-10-19 用户确认暂未申请两端 AppID 与 HTTPS 域名。当前交付开发包与下面的原生检查清单；没有模拟声称平台发布或真机验证通过。

## 10 自动验证

```powershell
npm run mini:build   # 生成并自检两份产物
npm run mini:check   # 7 项发布配置检查 + 50 项双端逻辑，隔离 API 与临时库
```

`mini:check` 由 `scripts/check-miniprograms.py` 新建 `runtime/mini-tests/{本次运行}/` 临时数据库、上传目录和随机端口 API，迁移并导入示例，检查后关闭。两端产物仍保留普通 8010/3010 开发配置；不读取日常库或管理员凭据。测试是 Node 宿主模拟 + 部分真实接口，不是平台编译。

最新结果：发布配置 **7 项通过**，双端逻辑 **50 passed / 0 failed / 0 skipped**，日志 `artifacts/acceptance-20261019/mini-release-config.log`。配置测试执行真实 CLI，并比较两份生成目录的内容摘要，确认只读检查和失败构建不改动产物；单独日志 `mini-config.log`。已同步 Web 可读性修复：辅助色 #626F84、首页渐变及统计/公告文字、搜索 32rpx 与至少 44px 点击区域。覆盖页面/模板/事件、建议与稳定版、下载方案、搜索与高亮、同步与完整收藏缓存、请求合并回流、反馈、断网重试、复制兜底、广告面积/时长/关闭及正式配置预检查。三项真实写入（反馈、同步码、统计）仅写本次临时库；不因反复使用日常 API 配额而跳过。不要直接将 `tests/miniprogram.test.cjs` 指向生产。以上不代表原生开发工具编译或真机验收。

这些测试不等于平台原生编译或真机验收，见下一节。

## 11 真机验证清单（需要在开发者工具中手工检查）

本轮未使用微信与小红书开发者工具完成原生验收，以下各项需要在工具与真机里逐项确认。建议用 iPhone（含刘海屏）与一台安卓手机，分别在 360 / 390 宽度的模拟器下各看一遍。

### 11.1 微信开发者工具（导入 `apps/miniprogram-wechat`）

1. 编译无报错、无「组件未找到」「WXML 语法」类警告；基础库选 2.x 以上（`project.config.json` 默认 3.7.0）。
2. 底栏 4 项「首页 / 软件库 / 公告 / 我的」，图标清晰、选中为蓝色；在详情或公告详情页时没有底栏。
3. 收藏一个软件，在后台给它发布新版本：首页出现「收藏的软件有更新」，「我的」底栏显示数字角标；打开该软件详情后返回，区块与角标消失。
4. 首页：概览卡蓝色渐变、统计胶囊可换行；公告横滑、分类宫格 4 列；设备 chips 切换不跳回顶部；第 3 条更新后出现广告（后台打开广告并上线一条投放时）；广告有「广告」标签、✕ 可关闭、点击复制链接。
5. 软件库：分类 chips 横滑、排序切换、点星只收藏不进入详情；从首页分类宫格进入时对应分类已选中。
6. 详情：设备格 4 列不换行、「本机」角标；版本条横滑；分段栏滚动时**吸顶**；「云盘助手 · 电脑」显示红色「先别更新」与「复制稳定版 4.0.6 下载链接」；复制后粘贴到备忘录确认内容正确；有提取码时提取码单独复制；底部操作条不遮挡最后内容、贴合 iPhone 底部安全区。
7. 反馈：点「能正常用」数字 +1；改投一减一加，再点同项撤销。点「有问题」即记录问题票，弹层补类型和说明（最多 300 字）不再加票。弹层背景不滚动，键盘不遮挡输入；后台显示正确来源。
8. 分享：详情页右上角「转发」与分享弹层里「分享给群友」的卡片标题含版本号；从分享卡片进入时选中同一设备与版本；朋友圈分享可打开。
9. 搜索：进入即弹出键盘；输入「网盘」实时出结果并黄色高亮；搜不到时可提交想要的软件。
10. 我的：生成同步码显示为 `XXXXX-XXXXX`，可复制；在网站「我的」或另一台手机输入可恢复（与网站互通，R-MINI-07 验收）；常用设备、更新提醒开关生效；关于 / 隐私 / 免责弹层显示后台文字。
11. 断网（开发者工具 Network 设为 Offline）后下拉刷新：各页面显示「加载失败了」与「重试」。
12. 复制失败兜底：在不允许剪贴板的环境中出现可长按选择的文本。
13. 后台「用户反馈」能看到小程序提交的「有问题」；后台工作台广告曝光 / 点击计数有增加。

### 11.2 小红书开发者工具（导入 `apps/miniprogram-xhs`）

除上面 1–13 项外，重点确认构建转换后的差异：

1. `.xhsml` / `.css` 全部编译通过；`xhs:if` / `xhs:for` 渲染正确；`scroll-view` 横滑、`switch`、`textarea`、`input` 等原生组件均可用。
2. 原生 `tabBar` 正常显示 4 项与图标；`setTabBarBadge` 是否支持（不支持时角标不显示属预期）。
3. 样式：CSS 变量已替换为常量，颜色、圆角、阴影与微信端一致；`position: sticky` 的分段栏与搜索栏是否吸顶；`env(safe-area-inset-bottom)` 是否生效。
4. 本地存储（收藏、同步码、搜索历史）重启小程序后仍在。
5. `button open-type="share"` 与右上角分享是否可用；分享路径带 `slug / platform / release`。
6. `IntersectionObserver` 是否可用；不可用时不计曝光。可用时仅面积至少 50% 且持续 1 秒计一次；关闭和素材失败后不计。
7. 剪贴板复制与 toast 文案完整显示（长文案是否被截断）。
8. 小红书账号类目、AppID 开发权限、合法域名配置后真机扫码预览。

## 12 持久化与备份

继续备份 API 使用的数据库与上传目录，具体路径见站点运维文档。小程序不存储另一份数据库；收藏、浏览记录等只在用户手机本地。升级小程序不会修改或清空软件、版本、公告、图片。

## 13 小红书官方规范依据

- [小程序代码构成](https://miniapp.xiaohongshu.com/doc/DC451266)：XHSML 模板、CSS 样式、JSON 配置、JavaScript 脚本与 `xhs` 接口。
- [快速开始](https://miniapp.xiaohongshu.com/doc/DC611695)：账号、AppID 开发权限、开发者工具与编译预览。
- [JS API](https://miniapp.xiaohongshu.com/doc/DC138997)：回调式接口能力与版本检测。

只在 `utils/platform.js` 引用 `wx` / `xhs`；分享菜单、底栏角标、滚动等可选能力都做存在性检查，核心的数据读取与复制链接不依赖它们。
