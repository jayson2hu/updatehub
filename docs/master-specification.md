
# 软件更新公告与官方导航平台
## Product + UX + Architecture + Engineering Master Specification

版本：V1.0  
项目阶段：从 0 到 1  
目标：可以直接交给 AI 编程 Agent，根据本文档完成设计、开发、测试、部署。

---

# 0. 给开发 AI 的最高优先级指令

你正在开发的不是传统“软件下载站”。

本项目是：

> 面向固定用户群的软件更新公告、软件识别、官方入口、新用户指引与自助答疑平台。

核心原则：

1. 本站暂时不托管任何软件安装包。
2. 本站不提供第三方镜像。
3. 所有主要下载行为最终跳转软件官方网站、官方 Release 页面或官方应用商店。
4. 不允许使用“高速下载”“安全下载”等容易让用户误解为本站托管的软件按钮。
5. 主按钮统一使用：
   - 前往官方网站
   - 前往官方下载页面
   - 查看官方 Release
6. 网站首先解决：
   - 用户不知道自己该找哪个软件。
   - 用户不知道软件名称。
   - 用户找不到之前群里发过的链接。
   - 用户不知道现在是否需要升级。
   - 新用户不知道首先应该安装哪些软件。
   - 管理员大量重复回答同样的问题。
7. 用户体验优先于功能数量。
8. 第一版必须做好手机浏览器和 PC Web。
9. 暂时不开发原生 iOS / Android App。
10. 广告不能伪装成下载按钮，不得干扰官方入口。
11. 所有软件、版本、官方 URL 都必须通过后台管理。
12. 自动检测新版本只能作为辅助，发布必须保留人工确认。
13. 所有关键功能必须真正可操作，不允许只做不可点击的 UI Demo。
14. 优先完成完整闭环，而不是堆叠大量边缘功能。

如果需求出现模糊情况：

> 优先选择最简单、最低维护成本、最符合“降低群答疑成本”的实现。

---

# 1. 项目背景

目前存在一个固定用户群。

管理员会关注若干软件。

当这些软件的官方网站发布新版本以后，管理员需要：

```text
发现新版本
↓
确认版本信息
↓
找到官方地址
↓
在群里发布通知
↓
用户自行前往官网下载
```

但是目前出现几个明显问题。

## 问题一：用户不知道自己需要找什么软件

很多用户并不能准确说出软件名称。

他们可能只知道：

```text
“群里之前让安装的那个软件”
“那个写代码的软件”
“那个连接用的软件”
“那个蓝色图标的软件”
“新电脑需要安装哪些？”
```

传统的“软件下载列表 + 搜索框”无法很好解决。

---

## 问题二：更新链接淹没在聊天记录中

群消息不断滚动。

用户过几天会问：

```text
之前那个下载地址在哪里？
最新版在哪里？
这个软件官网是什么？
```

管理员只能重复发送。

---

## 问题三：用户不知道是否需要升级

软件版本发布以后，不代表所有用户必须立即升级。

用户真正需要的是：

```text
最新版本是什么？

我当前版本还能不能用？

这个版本为什么值得升级？

有没有已知问题？

升级前需要注意什么？
```

---

## 问题四：新用户 onboarding 成本高

新加入群的用户不知道：

```text
需要安装什么？
按照什么顺序安装？
软件分别有什么作用？
从哪里下载？
Windows 和 Mac 怎么选择？
```

管理员需要重复解释。

---

## 问题五：管理员重复劳动

管理员当前承担：

```text
版本跟踪
+
官方链接整理
+
更新公告编写
+
新人指导
+
重复 FAQ
+
链接重复发送
```

这些信息应该沉淀到系统。

---

# 2. 产品定位

产品定位：

> 软件更新公告中心 + 官方软件导航 + 新用户软件识别助手 + 群运营知识库。

不是：

> 软件下载资源站。

核心价值不是：

> “我这里有安装包。”

而是：

> “我帮你知道该找哪个软件、现在是什么版本、是否需要升级、注意什么，以及正确的官方入口在哪里。”

---

# 3. 产品名称工作名

开发阶段使用：

```text
UpdateHub
```

中文暂定：

```text
软件更新中心
```

后续品牌名称可单独调整。

代码中不得把品牌名称硬编码到大量组件，应统一使用：

```text
site_settings
```

或者环境配置。

---

# 4. 产品目标

第一阶段主要实现三个目标。

## 用户目标

让普通用户在 30 秒以内完成：

```text
找到自己的软件
→
确认是否需要更新
→
进入官方网站
```

新用户在 3 分钟以内完成：

```text
知道需要哪些软件
→
了解每个软件作用
→
获取官方入口
```

---

## 管理员目标

一次发布即可完成：

```text
更新网站
+
生成群通知文案
+
更新软件最新版本
+
生成历史更新记录
```

---

## 业务目标

显著降低以下重复问题：

```text
软件在哪下载？
哪个是最新版？
这个要不要更新？
Windows 下哪个？
Mac 下哪个？
新用户装什么？
之前链接在哪里？
```

---

# 5. 非目标

MVP 阶段明确不做：

```text
安装包托管
P2P 下载
下载加速
第三方镜像
破解软件
用户上传安装包
软件论坛
大型评论社区
复杂积分系统
原生手机 App
桌面客户端
软件自动安装
自动修改用户电脑
复杂用户账号体系
付费会员体系
```

这些功能不得因为“看起来高级”而提前加入。

---

# 6. 用户角色

系统存在三类主要角色。

## Visitor 普通访客

无需登录。

可以：

```text
查看软件
搜索软件
按用途找软件
查看更新
查看公告
查看教程
查看 FAQ
访问官方地址
维护本地“我的软件”
```

---

## Returning User 长期用户

第一阶段仍然可以不注册账号。

浏览器 LocalStorage 保存：

```text
我的软件
最近浏览
用户选择的系统
```

如果用户清除浏览器数据，则这些信息可能丢失。

V2 可以增加账号同步。

---

## Admin 管理员

需要登录后台。

可以：

```text
添加软件
编辑软件
设置别名
管理分类
管理软件用途
维护官方地址
发布版本更新
生成群通知
管理新手指南
管理 FAQ
管理广告
查看访问数据
查看官方链接点击数据
```

---

# 7. 核心 Jobs To Be Done

用户不是为了“浏览软件下载站”而来。

真正的任务是：

### JTBD 1

当群里告诉我某个软件更新时：

> 我想快速确认是不是我正在使用的软件，以及是否需要升级。

### JTBD 2

当我不知道软件名称时：

> 我想根据软件用途、图标、常用名称等找到它。

### JTBD 3

当我是新用户时：

> 我想知道应该安装哪些软件以及安装顺序。

### JTBD 4

当我准备下载时：

> 我想确认自己正在前往官方渠道，而不是不可信第三方网站。

### JTBD 5

当我是管理员时：

> 我只想维护一次信息，而不是网站更新一次、群公告又手写一次。

---

# 8. 产品核心闭环

```text
                软件官方发布版本
                        │
                        ▼
                 管理员发现更新
                        │
                        ▼
                  后台创建更新
                        │
                        ▼
                   人工确认内容
                        │
           ┌────────────┼────────────┐
           ▼            ▼            ▼
       软件最新版本    更新公告     群通知文案
           │            │
           └──────┬─────┘
                  ▼
               前台展示
                  │
             用户打开页面
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
    找到自己的软件         查看最近更新
       │                     │
       └──────────┬──────────┘
                  ▼
             判断是否需要升级
                  │
                  ▼
             前往官方网站
```

新用户：

```text
进入网站
↓
我是新用户
↓
选择使用场景
↓
选择操作系统
↓
推荐软件清单
↓
理解每个软件作用
↓
添加“我的软件”
↓
进入官方网站
```

---

# 9. MVP 核心功能

P0 必须完成：

```text
首页
软件搜索
按用途找软件
软件列表
软件详情
更新公告
更新详情
新用户指引
我的软件
FAQ
官方 URL 跳转
后台登录
软件管理
软件分类
软件别名
官方链接管理
版本更新管理
公告发布
群通知自动生成
基本访问统计
手机响应式
SEO
安全控制
```

P1：

```text
软件合集
最近浏览
更新重要程度
操作系统筛选
推荐安装顺序
官方链接健康检查
更新草稿
内容预览
后台审计日志
广告管理
```

P2：

```text
自动发现版本
GitHub Release 监控
RSS 监控
官方页面检测
邮件通知
Telegram/Discord/Webhook 通知
用户账号
跨设备同步
用户订阅更新通知
截图识别软件
图标识别
浏览器扩展
```

---

# 10. 首页 UX 设计

首页不是传统的软件商城。

第一屏首先回答：

> “你来这里想解决什么？”

PC：

```text
-----------------------------------------------------

LOGO

找软件     最近更新     新用户指南     FAQ

                                      管理入口

-----------------------------------------------------

不知道软件名字？
告诉我你要做什么。

[ 🧭 帮我找软件 ]
按用途、系统和场景推荐

[ 🔎 我知道一点名字 ]
输入名字、关键词、用途

-----------------------------------------------------

我的软件

VS Code    Chrome    Notion     + 添加

-----------------------------------------------------

最近更新

软件 A
v3.1 → v3.2
推荐更新

[查看详情]

软件 B
v5.0
普通更新

[查看详情]

-----------------------------------------------------
```

---

# 11. “帮我找软件”是核心体验

传统搜索要求用户知道名字。

这里必须支持：

## 路径一：按用途

用户选择：

```text
开发编程
办公效率
设计
网络工具
日常必备
文件管理
沟通协作
系统工具
其他
```

然后推荐软件。

---

## 路径二：按描述搜索

用户输入：

```text
写代码
浏览网页
记笔记
做 UI
容器
Git
远程连接
压缩文件
```

搜索应该匹配：

```text
软件名称
别名
用途
标签
简介
```

---

## 路径三：软件别名

后台支持维护：

```text
Visual Studio Code
VS Code
VSCode
蓝色代码编辑器
微软代码编辑器
```

用户任意搜索都可以找到。

---

## 路径四：新用户软件包

管理员可以配置：

```text
开发人员基础软件
普通办公用户
设计师基础环境
新电脑必装
```

每个合集包含：

```text
软件
作用
推荐顺序
是否必选
注意事项
```

---

# 12. 我的软件

第一版不要求登录。

保存到：

```text
LocalStorage
```

数据结构：

```json
{
  "followedSoftwareIds": [
    "vscode",
    "chrome",
    "git"
  ],
  "platform": "windows"
}
```

用户可以：

```text
关注软件
取消关注
查看我的软件
查看是否有更新
```

首页优先显示。

后续增加登录以后，可以同步到数据库。

---

# 13. 软件列表页

URL：

```text
/software
```

支持：

```text
关键词搜索
分类
操作系统
用途
更新状态
```

卡片设计：

```text
[ICON]

Visual Studio Code

代码编辑和开发工具

开发工具

Windows / macOS / Linux

当前版本
1.106.0

推荐更新

[查看软件]

[关注更新]
```

禁止：

```text
巨大的“立即下载”按钮。
```

---

# 14. 软件详情页

URL：

```text
/software/{slug}
```

例如：

```text
/software/visual-studio-code
```

顶部：

```text
[ICON]

Visual Studio Code

代码编辑器

当前官方版本：
1.106.0

发布时间：
2026-09-21

更新建议：
推荐更新

支持：
Windows / macOS / Linux

[前往官方网站]
```

必须明确：

> 本站不提供软件安装包，点击后将前往软件官方渠道。

---

## 软件详情内容

依次包含：

```text
软件用途

适合谁使用

当前版本

更新建议

支持平台

官方入口

最近更新

历史更新

安装教程

常见问题

类似软件
```

---

# 15. 更新建议等级

统一定义：

## critical

显示：

```text
🔴 建议尽快更新
```

用于：

```text
严重安全修复
版本即将强制淘汰
旧版本无法继续工作
```

---

## recommended

```text
🟢 推荐更新
```

主要功能、兼容性或稳定性升级。

---

## optional

```text
🟡 可选更新
```

旧版本仍然正常。

---

## hold

```text
⚪ 建议暂缓
```

已发现兼容问题。

后台必须可以填写：

```text
reason
```

例如：

> 部分 Windows 用户反馈升级后插件异常，建议等待后续版本。

---

# 16. 更新公告

URL：

```text
/updates
```

展示：

```text
今天
昨天
本周
更早
```

单条：

```text
Visual Studio Code
1.105 → 1.106

推荐更新

今天 10:20

修复终端稳定性问题……

[查看详情]
```

---

# 17. 更新详情页

URL：

```text
/update/{slug}
```

内容：

```text
软件名称

版本

发布日期

我们的发布时间

更新建议

旧版本

新版本

本次变化

为什么建议更新

哪些用户需要更新

哪些用户可以暂缓

升级注意事项

已知问题

官方 Release 地址

官网地址
```

---

# 18. 新用户 onboarding

URL：

```text
/start
```

第一步：

```text
你使用什么系统？

Windows
macOS
Linux
不确定
```

第二步：

```text
你主要用电脑做什么？

开发编程
普通办公
设计
学习
综合使用
```

第三步：

推荐软件清单：

```text
开发用户基础清单

1. Chrome
   浏览器
   推荐

2. VS Code
   写代码
   必需

3. Git
   版本管理
   必需

4. Docker
   容器
   按需
```

用户点击：

```text
+ 加入我的软件
```

完成以后：

```text
你的软件清单已建立

以后访问首页可以直接查看这些软件有没有更新。
```

---

# 19. FAQ

URL：

```text
/faq
```

第一批建议内容：

```text
我应该在哪里下载软件？

本站会不会提供安装包？

Windows x64 和 ARM 怎么选择？

macOS Intel 和 Apple Silicon 怎么选择？

为什么官网版本和这里不一样？

为什么有更新但不建议升级？

怎么确认自己当前的软件版本？

软件官网打不开怎么办？

我的软件为什么没有显示？

更新以后需要重新配置吗？
```

支持软件专属 FAQ。

---

# 20. 手机体验

手机端不是 PC 简单缩小。

用户大概率从群聊点击链接进入。

手机首页优先顺序：

```text
搜索 / 找软件

我的软件

最近更新

我是新用户

FAQ
```

软件卡片采用单列。

主按钮宽度：

```text
100%
```

软件详情的：

```text
前往官方网站
```

必须明显。

但仍显示：

> 即将离开本站。

---

# 21. PC 体验

PC 允许更高信息密度。

使用：

```text
左侧主要内容
+
右侧辅助信息
```

例如：

```text
软件详情                  右侧

更新说明                  当前版本
版本记录                  更新等级
教程                      官方入口
FAQ                       最近更新
```

---

# 22. 广告策略

允许广告，但是广告不应该破坏信任。

广告必须显示：

```text
赞助推荐
Sponsored
```

允许位置：

```text
首页软件列表之间
软件详情内容末尾
更新文章末尾
FAQ 侧栏
教程侧栏
```

禁止：

```text
紧贴“前往官方网站”

模仿下载按钮

绿色巨型“立即下载”

虚假倒计时

弹窗遮挡页面

点击关闭却跳转广告
```

核心原则：

> 官方入口永远比广告更清晰。

---

# 23. SEO

网站公开内容应支持 SEO。

URL 应保持清晰：

```text
/software
/software/vscode

/updates
/update/vscode-1-106

/guides
/guide/vscode-install

/faq

/category/developer-tools
```

每个软件页面包含：

```text
title
meta description
canonical
OpenGraph
JSON-LD
```

推荐 Schema：

```text
SoftwareApplication
BreadcrumbList
FAQPage
Article
```

禁止大量生成没有实际内容的低质量 SEO 页面。

---

# 24. 管理后台信息架构

后台：

```text
/dashboard

/software
/software/new
/software/{id}

/updates
/updates/new
/updates/{id}

/collections

/guides

/faq

/ads

/analytics

/settings

/audit
```

侧边栏：

```text
概览
软件
更新公告
新用户清单
教程
FAQ
广告
数据分析
系统设置
操作日志
```

---

# 25. 后台 Dashboard

显示：

```text
已收录软件数量

本周新增更新

今日访问量

官方链接点击

最常访问软件

最多搜索关键词

搜索无结果关键词

最新后台操作
```

非常重要：

## 搜索无结果关键词

这是产品的重要数据来源。

例如：

```text
clash verge
小猫
蓝色软件
连接工具
```

管理员可以根据这些数据增加：

```text
软件
别名
关键词
FAQ
```

---

# 26. 新建软件

字段：

```text
名称
slug
短名称
简介
详细描述
ICON
分类
标签
用途
官方主页
官方文档
GitHub
支持平台
发布状态
SEO title
SEO description
```

---

# 27. 软件别名

一款软件允许多个别名。

例如：

```text
software:
Visual Studio Code

aliases:

VS Code
VSCode
vscode
微软代码编辑器
代码编辑器
```

搜索必须匹配 aliases。

---

# 28. 官方链接

一个软件可以有多个官方入口：

```text
官方网站

Windows 下载页

macOS 下载页

Linux 下载页

GitHub Release

官方文档

Microsoft Store

Mac App Store
```

每条 URL 保存：

```text
label
url
platform
type
is_primary
is_active
last_checked_at
```

---

# 29. 更新发布工作流

状态：

```text
draft
↓
review
↓
published
↓
archived
```

不允许自动检测到版本后直接公开发布。

---

# 30. 发布更新页面

字段：

```text
software_id

version

previous_version

official_release_date

update_level

title

summary

changes

reason_to_update

who_should_update

who_can_wait

known_issues

notes

official_release_url

status
```

---

# 31. 群通知自动生成

更新发布以后自动生成：

```text
📢 Visual Studio Code 更新提醒

最新版本：
v1.106.0

更新建议：
🟢 推荐更新

主要变化：

• 修复终端稳定性问题
• 优化扩展运行性能
• 改进部分界面体验

更新详情：
https://domain.com/update/vscode-1-106

官方下载：
请进入页面后通过官方入口下载。
```

后台：

```text
复制群通知
```

必须真正调用 Clipboard API。

---

# 32. 推荐技术架构

推荐：

```text
Frontend
Next.js
TypeScript
React
Tailwind CSS
组件库

Backend
FastAPI
Python

Database
PostgreSQL

Cache
Redis（MVP 可暂时不启用）

Reverse Proxy
Caddy 或 Nginx

Container
Docker Compose

CI/CD
GitHub Actions
```

---

# 33. 总体架构

```text
                        ┌──────────────────┐
                        │      User        │
                        │ PC / Mobile Web  │
                        └─────────┬────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ CDN / Cloudflare │
                        └─────────┬────────┘
                                  │
                                  ▼
                        ┌──────────────────┐
                        │ Reverse Proxy    │
                        │ Caddy / Nginx    │
                        └──────┬───────┬───┘
                               │       │
                     /         │       │ /api
                               │       │
                               ▼       ▼
                     ┌────────────┐ ┌────────────┐
                     │  Next.js   │ │  FastAPI   │
                     │  Frontend  │ │  Backend   │
                     └────────────┘ └──────┬─────┘
                                           │
                         ┌─────────────────┼───────────────┐
                         ▼                 ▼               ▼
                    PostgreSQL          Redis        External URLs
                                                       官方网站
                                                       GitHub
```

---

# 34. 为什么前后端分离

前端主要负责：

```text
SSR / SEO
页面展示
响应式体验
搜索交互
我的软件
后台 UI
```

后端负责：

```text
业务规则
数据存储
管理员认证
内容审核
官方 URL 管理
数据分析
搜索
审计
```

---

# 35. Monorepo 结构

建议：

```text
updatehub/
│
├── apps/
│   │
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   ├── lib/
│   │   ├── hooks/
│   │   ├── styles/
│   │   └── public/
│   │
│   └── api/
│       ├── app/
│       │   ├── api/
│       │   ├── core/
│       │   ├── models/
│       │   ├── schemas/
│       │   ├── services/
│       │   ├── repositories/
│       │   ├── jobs/
│       │   └── main.py
│       │
│       └── tests/
│
├── packages/
│   ├── types/
│   └── config/
│
├── infra/
│   ├── docker/
│   ├── caddy/
│   └── scripts/
│
├── docs/
│   ├── product/
│   ├── architecture/
│   └── api/
│
├── docker-compose.yml
├── .env.example
├── Makefile
└── README.md
```

---

# 36. 前端目录规划

```text
apps/web/
│
├── app/
│   ├── page.tsx
│   ├── software/
│   ├── updates/
│   ├── update/
│   ├── start/
│   ├── faq/
│   ├── guides/
│   └── admin/
│
├── components/
│   ├── layout/
│   ├── ui/
│   ├── software/
│   ├── update/
│   ├── search/
│   └── admin/
│
├── features/
│   ├── software-finder/
│   ├── my-software/
│   ├── search/
│   └── outbound-link/
│
├── lib/
│   ├── api.ts
│   ├── analytics.ts
│   ├── storage.ts
│   └── utils.ts
│
└── types/
```

---

# 37. 后端分层

禁止把所有代码写进：

```text
main.py
```

必须分层：

```text
Router
↓
Service
↓
Repository
↓
Database
```

职责：

## Router

```text
请求参数
认证
HTTP 状态码
response schema
```

## Service

```text
业务逻辑
发布规则
版本规则
搜索规则
```

## Repository

```text
数据库查询
CRUD
```

---

# 38. 数据模型

## software

```text
id UUID PK

name VARCHAR

slug VARCHAR UNIQUE

short_name VARCHAR NULL

summary TEXT

description TEXT

icon_url TEXT

category_id UUID

website_url TEXT

docs_url TEXT NULL

github_url TEXT NULL

latest_version VARCHAR NULL

update_level VARCHAR

published BOOLEAN

created_at TIMESTAMP

updated_at TIMESTAMP
```

---

## software_alias

```text
id UUID

software_id UUID

alias VARCHAR

normalized_alias VARCHAR
```

建立索引：

```text
normalized_alias
```

---

## category

```text
id
name
slug
sort_order
```

---

## software_tag

```text
id
software_id
tag
```

---

## software_platform

```text
id
software_id

platform:
windows
macos
linux
android
ios
web

architecture:
x64
arm64
universal
null
```

---

## official_link

```text
id UUID

software_id UUID

label

url

type

platform NULL

architecture NULL

is_primary

is_active

last_checked_at

created_at

updated_at
```

---

## release_update

```text
id UUID

software_id UUID

slug

version

previous_version

title

summary

changes JSONB

update_level

reason_to_update TEXT

who_should_update TEXT

who_can_wait TEXT

known_issues TEXT

notes TEXT

official_release_url TEXT

official_release_date DATE

status

published_at

created_at

updated_at
```

---

## guide

```text
id

software_id NULL

title

slug

summary

content

category

published

published_at
```

---

## faq

```text
id

software_id NULL

question

answer

sort_order

published
```

---

## collection

用于：

```text
开发人员必装
新电脑基础软件
设计师工具包
```

字段：

```text
id
name
slug
description
published
```

---

## collection_item

```text
collection_id
software_id
sort_order
importance
note
```

---

## admin_user

```text
id
email
password_hash
role
is_active
last_login_at
created_at
```

---

## audit_log

```text
id
admin_user_id
action
resource_type
resource_id
payload JSONB
ip
created_at
```

---

## search_log

```text
id
query
result_count
session_id
created_at
```

---

## outbound_click

```text
id
software_id
official_link_id
source_page
session_id
created_at
```

不要默认存储过多个人信息。

---

# 39. API 设计

Base：

```text
/api/v1
```

---

## 软件

```text
GET /software

GET /software/{slug}

GET /software/{slug}/updates

GET /categories
```

参数：

```text
q
category
platform
page
page_size
```

---

## 搜索

```text
GET /search?q=xxx
```

搜索字段：

```text
name
short_name
aliases
tags
summary
用途
```

---

## 更新

```text
GET /updates

GET /updates/{slug}
```

---

## 指南

```text
GET /guides

GET /guides/{slug}
```

---

## FAQ

```text
GET /faq
```

---

## 合集

```text
GET /collections

GET /collections/{slug}
```

---

# 40. Admin API

```text
POST   /admin/auth/login

POST   /admin/software
PATCH  /admin/software/{id}
DELETE /admin/software/{id}

POST   /admin/software/{id}/links

POST   /admin/updates
PATCH  /admin/updates/{id}
POST   /admin/updates/{id}/publish

POST   /admin/guides

POST   /admin/faq

POST   /admin/collections

GET    /admin/analytics

GET    /admin/audit
```

---

# 41. 外链跳转

建议不要页面直接把大量 URL 写死。

可以通过：

```text
/go/{official_link_id}
```

后端：

```text
确认链接存在
确认 active
记录匿名 click
302 Redirect
```

但是必须防止 Open Redirect。

只能跳转：

```text
数据库中管理员预先保存的 URL
```

用户不得自己传入：

```text
/go?url=https://xxx
```

---

# 42. 搜索设计

MVP：

PostgreSQL 即可。

搜索权重：

```text
软件名称        100
软件别名         90
短名称           85
标签             60
用途             50
简介             30
```

后续数据量大以后考虑：

```text
Meilisearch
Typesense
OpenSearch
```

MVP 不需要提前增加复杂搜索集群。

---

# 43. 搜索失败策略

如果：

```text
result_count = 0
```

记录：

```text
search_log
```

前台显示：

```text
没有找到？

你可以：

查看常用软件
按用途选择
查看新用户清单
```

不要只有：

```text
暂无数据
```

---

# 44. 软件识别能力

MVP 应支持：

```text
名字
别名
用途
分类
图标
常见叫法
```

未来可以增加：

```text
截图识别

桌面图标识别

上传“关于软件”截图

AI 判断软件名称
```

但不要在第一版本加入图像 AI 系统。

---

# 45. 后台自动版本检测

Phase 2。

支持 Source Adapter。

接口：

```python
class VersionSource:
    async def fetch_latest_version(self) -> VersionResult:
        ...
```

实现：

```text
GitHubReleaseSource

RSSSource

JSONAPISource

ManualSource
```

以后可以扩展：

```text
WebPageSource
```

---

# 46. GitHub Release 检测

如果软件来自 GitHub：

保存：

```text
github_owner
github_repo
```

定时查询：

```text
Latest Release
```

发现：

```text
new_version != current_version
```

生成：

```text
Pending Update
```

不能直接公开发布。

后台显示：

```text
发现新版本

1.105.0
→
1.106.0

[查看官方 Release]

[生成草稿]

[忽略]
```

---

# 47. 后台发布 UX

发布按钮不是直接：

```text
保存
```

而是：

```text
保存草稿

预览

发布
```

发布前检查：

```text
是否有官方 URL

版本是否填写

软件是否启用

更新建议是否填写

是否存在危险 HTML
```

---

# 48. 群通知模板

模板系统支持：

```text
微信
QQ
Telegram
Discord
纯文本
Markdown
```

MVP 至少：

```text
纯文本
Markdown
```

---

# 49. 分析事件

前端事件：

```text
page_view

search

search_no_result

software_view

follow_software

unfollow_software

finder_start

finder_complete

official_link_click

guide_view

faq_open
```

原则：

> 采集产品改善需要的数据，不为了采集而采集。

---

# 50. 最核心数据指标

重点看：

## Find Success Rate

用户开始寻找软件以后，最终是否进入软件详情。

## Official Click Rate

查看软件以后是否点击官方入口。

## Search No Result Rate

多少搜索没有结果。

## Repeat FAQ Reduction

群内重复问答是否减少。

## My Software Usage

多少用户使用“我的软件”。

## New User Completion Rate

多少用户完成新用户流程。

---

# 51. 隐私设计

第一版不强制用户登录。

匿名 analytics 采用随机 session id。

避免收集：

```text
真实姓名
电话号码
设备序列号
电脑软件扫描数据
精确位置
```

除非未来真的需要并取得用户明确许可。

---

# 52. 管理后台认证

最低要求：

```text
email + password
```

密码：

```text
Argon2id / bcrypt
```

禁止明文。

Session 使用：

```text
HttpOnly
Secure
SameSite
```

管理员后台建议后续增加：

```text
TOTP 2FA
```

---

# 53. 安全要求

必须防护：

```text
SQL Injection

XSS

CSRF

Open Redirect

Broken Access Control

Brute Force

恶意 URL

文件上传攻击

后台越权
```

所有富文本必须 sanitize。

---

# 54. 官方 URL 验证

URL 必须：

```text
https://
```

特殊场景允许：

```text
http://
```

但后台给予警告。

自动访问外部 URL 时必须防 SSRF。

禁止请求：

```text
localhost

127.0.0.1

10.0.0.0/8

172.16.0.0/12

192.168.0.0/16

169.254.0.0/16

metadata service
```

并做好 DNS rebinding 防护。

---

# 55. 图标和图片

管理员可以：

```text
上传软件 ICON
```

限制：

```text
PNG
JPEG
WebP
SVG 谨慎处理
```

建议 SVG 先 sanitize。

MVP 可以使用：

```text
WebP / PNG
```

避免复杂 SVG 风险。

---

# 56. Accessibility

至少符合常规 WCAG 可访问性原则。

必须：

```text
按钮可键盘操作

明显 focus 状态

图片 alt

足够对比度

不能只用颜色区分重要状态

Modal 支持 Escape

表单 label

错误信息清晰
```

---

# 57. Loading

页面不得出现长期空白。

使用：

```text
Skeleton
```

而不是满屏 spinner。

---

# 58. Empty State

例如：

我的软件为空：

```text
你还没有添加常用软件

告诉我们你平时用电脑做什么，
可以快速建立你的软件清单。

[帮我找软件]
```

---

# 59. Error State

API 失败：

```text
暂时无法加载更新信息

[重新加载]
```

不能把：

```text
500 Internal Server Error
```

直接显示给普通用户。

---

# 60. 响应式断点

建议：

```text
Mobile
< 768px

Tablet
768 - 1024

Desktop
> 1024
```

不要依赖固定像素宽度。

---

# 61. 页面性能

目标：

```text
LCP < 2.5s

CLS < 0.1

INP 尽量 < 200ms
```

软件图片使用：

```text
lazy load
```

主页首屏必要资源优先加载。

---

# 62. 缓存策略

公开数据：

```text
软件列表
软件详情
更新列表
FAQ
指南
```

允许：

```text
CDN cache
ISR / server cache
```

后台发布以后主动：

```text
invalidate / revalidate
```

---

# 63. Redis

MVP 数据量小时可以不依赖。

后期用于：

```text
缓存
限流
后台任务锁
session
```

架构要允许加入，但第一版不要为了“完整”制造运维成本。

---

# 64. 后台任务

可以使用：

```text
Celery / ARQ / RQ
```

但 MVP 如果任务很少，可使用简单 scheduler。

自动检测版本增加后，再引入正式任务队列。

---

# 65. Logging

日志使用结构化格式：

```json
{
  "level": "INFO",
  "event": "software_update_published",
  "software_id": "...",
  "admin_id": "...",
  "timestamp": "..."
}
```

禁止日志输出：

```text
密码
session
token
secret
```

---

# 66. Observability

至少提供：

```text
应用日志

HTTP 错误率

API 延迟

数据库连接

服务器 CPU

服务器内存

磁盘空间
```

可以使用：

```text
Sentry

Prometheus + Grafana
```

MVP 先接：

```text
Sentry + 基础服务器监控
```

即可。

---

# 67. Health Check

后端：

```text
GET /health
```

返回：

```json
{
  "status": "ok"
}
```

另外：

```text
GET /ready
```

检查数据库。

---

# 68. Docker

至少包含：

```text
web

api

postgres

redis（可选）

caddy
```

---

# 69. docker-compose

开发环境：

```text
docker-compose.yml
```

生产环境建议：

```text
docker-compose.prod.yml
```

分开。

---

# 70. 环境变量

```text
DATABASE_URL

REDIS_URL

SECRET_KEY

ADMIN_INITIAL_EMAIL

ADMIN_INITIAL_PASSWORD

NEXT_PUBLIC_API_URL

PUBLIC_SITE_URL

SENTRY_DSN
```

提供：

```text
.env.example
```

绝对不能提交真实 secret。

---

# 71. 数据库迁移

使用：

```text
Alembic
```

任何 schema 修改必须：

```text
migration
```

不允许生产环境直接手改表。

---

# 72. Seed

提供开发 seed：

```text
8-15 个模拟软件

10 条更新

5 个 FAQ

2 个新用户合集
```

让前端不依赖手工创建数据才能开发。

---

# 73. API Schema

使用：

```text
Pydantic
```

输出字段必须明确。

禁止：

```text
直接 return ORM object
```

---

# 74. 前端 API Client

统一：

```text
lib/api.ts
```

禁止每个组件自己：

```text
fetch(...)
```

四处复制。

---

# 75. 状态管理

MVP：

```text
React state
URL state
server state
LocalStorage
```

不要过早加入复杂全局状态框架。

如果后续必要，再使用：

```text
Zustand
```

---

# 76. “我的软件”封装

建立：

```text
useMySoftware()
```

统一管理：

```text
follow
unfollow
contains
list
clear
```

不要多个页面直接操作 localStorage。

---

# 77. Design System

基础变量：

```text
spacing

font size

radius

shadow

background

text

primary

success

warning

danger
```

第一版推荐风格：

> 极简、可信、内容优先。

不要设计成：

```text
满屏渐变
大量玻璃特效
游戏 UI
传统盗版下载站
```

---

# 78. 色彩语义

```text
Primary
品牌操作

Success
推荐更新 / 正常

Warning
可选 / 注意

Danger
重要更新 / 风险

Neutral
普通内容
```

不能把所有软件都做成高饱和多彩卡片，避免视觉噪音。

---

# 79. 软件 ICON

ICON 用于解决：

> 用户可能认图标，但记不起名字。

因此 ICON 应该非常明显。

软件列表：

```text
48 × 48
```

详情：

```text
64 - 80
```

---

# 80. 内容优先

页面首要内容不是广告。

顺序：

```text
软件是谁

做什么

现在什么版本

需不需要更新

官方入口
```

其次才是：

```text
广告
```

---

# 81. 软件详情 SEO 文案

禁止 AI 大量生成空洞描述：

> “这是一款非常优秀且功能强大的软件……”

描述要回答：

```text
它做什么

谁需要它

为什么用户可能在群里看到它

什么时候需要更新
```

---

# 82. 后台批量能力

P1 可以加入：

```text
CSV 导入软件

批量更新分类

批量设置标签
```

但不能优先于基本发布流程。

---

# 83. 删除策略

软件不要直接物理删除。

使用：

```text
published = false
```

或者：

```text
archived_at
```

历史 update 保留。

---

# 84. 审计日志

记录：

```text
谁

什么时候

修改了什么

原值

新值
```

重点：

```text
官方 URL 修改

更新发布

管理员权限变化
```

---

# 85. 测试策略

必须同时具备：

```text
Unit Test

API Test

Integration Test

E2E Test
```

---

# 86. 后端 Unit Test

重点：

```text
版本发布逻辑

URL 验证

搜索 alias

update_level

权限

redirect 安全
```

---

# 87. API Test

例如：

```text
GET /software

GET /software/{slug}

GET /search

POST /admin/updates

POST /admin/updates/{id}/publish
```

---

# 88. E2E

使用：

```text
Playwright
```

关键测试：

```text
用户搜索 VSCode

用户通过“写代码”找到 VS Code

用户关注软件

刷新后“我的软件”仍存在

用户打开软件详情

用户点击官网

用户进入新用户向导

管理员登录

管理员创建软件

管理员发布更新

管理员复制群通知
```

---

# 89. 移动端 E2E

至少模拟：

```text
iPhone viewport

Android viewport
```

测试：

```text
菜单

搜索

Modal

按钮

官方链接

表单
```

---

# 90. CI

Pull Request 自动：

```text
lint

type check

unit tests

API tests

build
```

合并 main：

```text
build image

deploy staging

smoke test
```

---

# 91. Git 分支

建议：

```text
main
develop
feat/*
fix/*
chore/*
```

或者更简单：

```text
main

feat/*
fix/*
```

小团队不必为了流程复杂化。

---

# 92. Commit

推荐 Conventional Commits：

```text
feat:

fix:

refactor:

test:

docs:

chore:
```

---

# 93. Pull Request

PR 必须说明：

```text
为什么改

改了什么

怎么测试

有没有 DB migration

有没有 UI 截图
```

---

# 94. 开发阶段规划

## Phase 0：基础工程

完成：

```text
monorepo

Next.js

FastAPI

PostgreSQL

migration

Docker

CI

基础 Design System
```

完成标准：

```text
web 能访问

api 能访问

database 能连接

health check 正常
```

---

## Phase 1：核心软件数据

完成：

```text
software

category

alias

platform

official links

admin CRUD
```

完成以后管理员可以：

> 从后台完整维护一款软件。

---

## Phase 2：前台找软件

完成：

```text
首页

搜索

分类

用途搜索

软件列表

软件详情

我的软件
```

这是产品最重要阶段。

---

## Phase 3：更新公告

完成：

```text
更新 CRUD

更新等级

更新详情

历史版本

群通知生成
```

形成核心闭环。

---

## Phase 4：新用户体验

完成：

```text
新用户向导

软件合集

FAQ

教程
```

---

## Phase 5：SEO + Analytics

完成：

```text
metadata

schema

sitemap

robots

search logs

outbound clicks
```

---

## Phase 6：上线准备

完成：

```text
security

backup

monitoring

error reporting

performance

E2E

production Docker
```

---

# 95. 第一版本页面清单

公开页面：

```text
/

/software

/software/[slug]

/updates

/update/[slug]

/start

/collections/[slug]

/guides

/guide/[slug]

/faq
```

管理后台：

```text
/admin

/admin/login

/admin/software

/admin/software/new

/admin/software/[id]

/admin/updates

/admin/updates/new

/admin/updates/[id]

/admin/collections

/admin/guides

/admin/faq

/admin/analytics

/admin/settings

/admin/audit
```

---

# 96. 首页验收

必须可以真正完成：

```text
输入关键词搜索

点分类

打开软件

关注软件

打开“我的软件”

启动“帮我找软件”

按用途得到推荐

打开新用户指南

打开最近更新
```

不能存在：

```text
看起来是按钮但点击没有效果
```

---

# 97. 软件详情验收

必须展示：

```text
软件名称

ICON

作用

最新版本

更新等级

平台

官方链接

最近更新

历史更新
```

官方链接必须：

```text
新标签打开

rel=noopener
```

---

# 98. 后台验收

管理员必须能够：

```text
登录

创建软件

上传 ICON

添加别名

设置分类

添加官方链接

发布更新

修改更新

复制群通知

下线软件
```

整个流程不能依赖开发人员改数据库。

---

# 99. 数据备份

PostgreSQL：

```text
每日备份
```

至少保留：

```text
7-14 天
```

重要修改上线前手动备份。

必须测试恢复，不是只测试备份。

---

# 100. 上线域名结构

推荐：

```text
https://example.com
```

API：

```text
https://example.com/api/
```

优先同域，减少：

```text
CORS

Cookie

跨域认证
```

复杂度。

---

# 101. Production Reverse Proxy

建议：

```text
Cloudflare
↓
Caddy
↓
Next.js / FastAPI
```

开启：

```text
HTTPS

gzip / brotli

security headers

rate limit
```

---

# 102. Security Headers

至少：

```text
Strict-Transport-Security

X-Content-Type-Options

Referrer-Policy

Permissions-Policy

Content-Security-Policy
```

CSP 根据实际资源配置。

不要粗暴：

```text
script-src *
```

---

# 103. Rate Limit

重点接口：

```text
/admin/auth/login

/search

/go/*
```

限制异常请求。

---

# 104. 404

不要只写：

```text
Page Not Found
```

显示：

```text
没有找到这个页面

你可能在找：

软件中心

最近更新

新用户指南
```

---

# 105. 维护模式

管理员可设置：

```text
site maintenance
```

但是公开软件资料可以尽量继续只读。

---

# 106. 推荐的首发数据量

不要空站上线。

至少录入：

```text
15 - 30 款软件

10 - 20 条更新

10 个 FAQ

2 - 4 个新用户合集

5 - 10 篇教程
```

重点是这些内容必须来源于真实用户需求。

---

# 107. 推荐内容选择原则

不要追求：

> 收录 10000 个软件。

只收录：

> 群用户真正会用的软件。

例如只有 30 款，但是每一款信息准确，比收录 3000 款价值更高。

---

# 108. 产品核心护城河

未来真正有价值的不是软件数量。

而是：

```text
用户软件映射

软件别名库

更新判断

高质量升级建议

常见问题

新人配置流程

长期运营积累
```

---

# 109. V2：更新订阅

用户注册后可以选择：

```text
只通知我的软件

重要更新才通知

所有更新通知
```

渠道：

```text
Email

Telegram

Discord

Web Push
```

---

# 110. V2：版本检测

管理员后台：

```text
VS Code

当前：
1.105

检测到：
1.106

来源：
GitHub Official Release

[生成更新草稿]
```

AI 可以协助总结 Release Notes。

但是：

> AI 总结 ≠ 官方事实。

必须附：

```text
官方来源 URL
```

并允许人工编辑。

---

# 111. V2：AI 辅助公告

输入官方 Release Notes。

AI 输出：

```text
主要变化

适合普通用户理解的说明

是否涉及安全

可能需要注意的问题

群公告初稿
```

管理员确认后发布。

---

# 112. V3：软件识别助手

用户说：

```text
我找那个远程的软件

图标好像是蓝色

群里之前让我们装的
```

系统通过：

```text
向量搜索
别名
用途
历史热门
```

返回候选。

---

# 113. V3：截图识别

用户上传：

```text
桌面截图
开始菜单截图
软件关于页面
```

AI 识别软件。

但是需要特别处理：

```text
隐私提示

图片临时存储

自动删除

禁止长期训练用途
```

---

# 114. V3：自动软件环境清单

如果未来开发桌面 Agent，可以检测：

```text
用户安装了什么

当前版本是多少

是否需要升级
```

但这个能力会明显提高：

```text
安全风险

隐私风险

开发成本
```

绝对不属于当前 MVP。

---

# 115. 商业化

如果以后流量增大，可以：

```text
广告

软件厂商赞助

官方软件推荐位

企业 onboarding

软件更新监控 SaaS
```

但是：

> 商业化不得牺牲“官方可信”的核心定位。

---

# 116. 项目真正应该避免的错误

不要开发成：

```text
传统软件下载站

广告站

资讯门户

软件百科全书

全功能 App Store
```

否则项目会越来越大，却偏离最真实的问题。

---

# 117. 产品一句话

整个团队始终记住：

> 用户不是来“逛软件”的，而是来快速确认“我需要的是哪个软件、它有没有更新、我应该怎么办”。

---

# 118. 最关键的三个入口

无论后续 UI 如何调整，首页永远应该容易找到：

```text
帮我找软件

我的软件

最近更新
```

---

# 119. 第一版推荐首页信息优先级

```text
1 帮我找软件

2 我的软件

3 最近更新

4 新用户指南

5 软件库

6 FAQ

7 广告
```

不是：

```text
广告
推荐软件
排行榜
资讯
下载
```

---

# 120. Definition of Done

整个 MVP 只有满足以下条件才算完成：

用户：

```text
可以按用途找到软件

可以通过别名找到软件

可以查看软件信息

可以加入我的软件

刷新以后仍然保留

可以查看最新更新

可以判断是否建议升级

可以看到官方入口

可以进入官网

可以完成新用户 onboarding

手机操作正常
```

管理员：

```text
可以登录

可以创建软件

可以维护软件别名

可以维护官方入口

可以发布更新

可以编辑更新

可以生成群公告

可以查看搜索无结果

可以查看官方入口点击

所有管理行为有审计记录
```

工程：

```text
有 migration

有测试

有 Docker

有 CI

有 production config

有 backup

有 monitoring

没有 hardcode secret

没有 Open Redirect

没有明显 XSS

没有明显 SSRF
```

---

# 121. AI 开发执行规范

开发 Agent 必须遵守：

1. 先阅读整份文档。
2. 创建 `docs/implementation-plan.md`。
3. 把项目拆分成阶段任务。
4. 优先完成 Phase 0。
5. 每个阶段完成后运行测试。
6. 不允许一次性生成大量未经验证的代码。
7. 不允许为了“高级架构”引入没有使用价值的服务。
8. 不允许擅自加入复杂用户系统。
9. 不允许擅自加入安装包托管。
10. 不允许擅自把官网链接改为第三方下载地址。
11. 不允许建立不可点击的静态假按钮。
12. 所有 UI 行为必须有对应实现。
13. 所有后端 API 必须有 schema。
14. 所有数据库修改必须 migration。
15. 所有 Admin 修改关键数据的行为记录 audit log。
16. 每完成一个模块运行测试。
17. 前端完成后使用 Playwright 验证核心路径。
18. 移动端必须真实检查 375px 左右宽度。
19. README 必须写完整启动方法。
20. `.env.example` 必须完整。
21. 不要修改本规格中的核心产品定位。

---

# 122. AI 首轮开发任务

收到本文档以后，第一轮执行：

```text
Task 1
建立 Monorepo

Task 2
建立 Next.js Web

Task 3
建立 FastAPI

Task 4
建立 PostgreSQL

Task 5
建立 Alembic

Task 6
实现 software/category/alias/official_link 数据模型

Task 7
建立 Admin 基础认证

Task 8
建立 Software Admin CRUD

Task 9
建立公开 Software API

Task 10
建立首页、软件列表和软件详情
```

第一轮不要开发：

```text
AI
自动版本检测
通知系统
账号系统
复杂广告系统
```

---

# 123. 第二轮开发任务

```text
release_update

更新列表

更新详情

update_level

群通知生成

历史版本

我的软件

软件 Finder

搜索日志
```

---

# 124. 第三轮开发任务

```text
新用户 onboarding

collection

FAQ

guide

SEO

analytics

outbound click

后台 Dashboard
```

---

# 125. 第四轮开发任务

```text
安全检查

E2E

移动端测试

性能优化

Docker Production

Caddy

CI/CD

备份

监控
```

---

# 126. 项目完成以后交付内容

最终仓库必须包含：

```text
完整源码

README

产品说明

架构说明

数据库 ERD

API 文档

.env.example

Docker Compose

生产部署说明

备份说明

恢复说明

Admin 使用说明

测试说明

安全说明

CHANGELOG
```

---

# 127. README 必须回答

```text
这个项目是什么？

解决什么问题？

技术栈是什么？

本地怎么启动？

数据库怎么初始化？

怎么创建管理员？

怎么运行 migration？

怎么运行测试？

怎么构建？

怎么部署？

环境变量是什么？
```

---

# 128. 首次启动体验

期望：

```bash
git clone ...

cp .env.example .env

docker compose up -d

运行 migration

运行 seed
```

然后：

```text
http://localhost:3000
```

即可看到完整演示数据。

Admin：

```text
http://localhost:3000/admin
```

---

# 129. 最终产品判断标准

如果上线以后仍然经常有人在群里问：

```text
“软件在哪？”
“到底哪个是我要找的？”
“这个该不该更新？”
“新用户应该装什么？”
```

说明产品没有真正解决问题。

如果以后群里只需要发：

```text
软件 A 更新了：

https://domain.com/update/xxx
```

然后绝大多数用户可以自己完成：

```text
查看
→
理解
→
找到软件
→
进入官网
```

这个产品才算成功。

---

# 130. 项目最终定义

不要把这个项目理解成：

> Software Download Website

而应该理解为：

> Software Update & Guidance Platform

或者更完整：

> 面向固定用户群的软件发现、软件更新公告、官方入口、新用户 onboarding 和自助支持平台。

整个设计、开发和运营始终围绕一个核心指标：

> **减少用户寻找软件的时间，以及减少管理员重复回答同一个问题的次数。**

这就是本项目从开始到结束的最高产品原则。