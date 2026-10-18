# 公告中心验收记录

日期：2026-09-22。状态：公告中心本地功能、真实 PostgreSQL、前端构建与桌面 / 手机浏览器验收完成。

本轮依据 `product-positioning.md`，将产品主入口调整为公告中心，新增公告维护与发布工作流。首轮软件导航能力的历史验证记录保留在 `test-report.md`，其中的 38 项 API 测试、26 项 PostgreSQL 断言和浏览器结果不能直接作为公告功能已通过的证据。

## 检查记录

| 检查 | 当前结果 | 证据 / 待记录内容 |
| --- | --- | --- |
| 公告模型与 Alembic | PostgreSQL 通过 | 初始 revision `f6ed3cd8a998` 中写入软件后升级至 `d9e4582f723c`，原数据保留；`check` 无差异，完整降级 / 升级往返通过 |
| 后端单元与 API 回归 | 50 项通过 | `apps/api` 下 `.venv/Scripts/python -m pytest -q`；含已发布演示属性锁定、版本与审计原子性回归 |
| 公告 API / 生命周期 | PostgreSQL 冒烟通过 | 59 项总断言含新增公告行为；人工确认、直接 PATCH 状态拒绝、部分修改完整校验、失败后公告 / 软件 / 审计均不变 |
| 当前版本同步 | PostgreSQL 通过 | 旧记录修改、按官方日期补录旧版本、演示发布不覆盖真实新版本；归档保留版本事实 |
| 公开读取与排序 | 数据库与浏览器通过 | 草稿 / 归档 / 关联软件下线隔离、置顶优先、软件 ID 筛选；公告关键词 / 别名 / 类型 / 重要程度筛选均经浏览器检查 |
| 前端静态检查与构建 | 全部通过 | `npm run lint`、`npm run typecheck`、`npm run build`；Next.js 16.3.5 / Node.js 24 |
| 公告管理员浏览器闭环 | 7 组检查通过 | `tests/announcements_admin_e2e.py`；草稿、待审核、安全预览、人工发布、版本同步、修改、归档、纯文本和 Markdown 实际剪贴板内容；`artifacts/announcements-admin-e2e-result.json` |
| 原软件管理回归 | 10 组检查通过 | `tests/admin_e2e.py`；更新登录落地页后，软件维护 / 上传 / 下线 / 审计 / 退出仍正常 |
| 公告公开桌面与手机 | 9 组检查通过 | `tests/announcements_public_e2e.py`；首页、搜索筛选、详情、关注、软件关联公告、缺失页、375px / 393px；`artifacts/announcements-public-e2e.json` |
| 原公开软件能力回归 | 7 组检查通过 | `tests/public_e2e.py`；名称 / 别名 / 用途、关注、官方跳转和手机界面 |
| 演示真实性 | 通过 | 列表 / 详情 / 群通知均标记演示；首次发布后演示属性不可更改；演示公告不会覆盖真实软件版本 |
| Docker / HTTPS / 备份恢复 | 未执行 | 当前机器无 Docker CLI；本轮公告功能检查不构成生产部署验收 |

## 环境与数据边界

本次 PostgreSQL 17.10 / Python 3.14 在 Windows x64 实际执行。首次两次启动分别发现 55432 / 55433 已由其他工作区占用，启动失败后改用空闲的 `127.0.0.1:55439`；没有停止或连接其他工作区的数据库。最终 59 项断言及迁移往返通过，测试服务正常关闭。

执行命令：在仓库根目录设置 `$env:UPDATEHUB_PG_TEST_PORT = "55439"`，运行 `node tests/portable-postgres.mjs`。启动器调用 `tests/postgres_smoke.py`，使用全新 `updatehub_test_smoke` 数据库；密码临时生成且未输出。该脚本拒绝非测试库名与已有业务表的数据库。它不触碰本机预览数据库 `runtime.db`，不安装系统服务。

59 项由首轮目录回归、首轮迁移数据保留，以及公告创建 / 发布 / 版本同步 / 排序 / 隔离断言组成，并不表示运行了 59 个浏览器用例。新增复测确认已发布真实公告改为演示被 409 拒绝，真实软件版本与演示状态不变；防止重新分类后旧公告成为版本依据。另完成 seed 两次、管理员 CLI 创建、`alembic check` 与完整 downgrade / upgrade。只有 TestClient 依赖弃用提示，无测试失败。

管理员和数据库密码不得出现在测试报告、截图、源码或提交中。

## 浏览器环境与修复复测

浏览器使用本机 Microsoft Edge，由 Python Playwright 启动；界面连接本机开发服务与 SQLite 预览库。公开路径覆盖 1440px 桌面和 375px / 393px 手机，后台覆盖桌面与 375px。两套新增 E2E 的未捕获脚本错误为空。已查看首页、公告详情和后台的实际截图，未发现横向溢出或内容裁切。

最终公开测试曾在类型切换后立即读取旧界面，导致断言失败；已改为等待选中类型和公告内容完成切换，再检查结果，复测通过。发布后演示属性切换导致旧公告重新成为版本依据的问题，经后端锁定和 50 项 API / 59 项 PostgreSQL 复测修复；后台同步锁定选项。

截图：`artifacts/announcements-home-desktop.png`、`announcements-home-mobile-375.png`、`announcement-detail-desktop.png`、`announcement-detail-mobile-375.png`、`announcements-admin-desktop.png`、`announcements-admin-mobile-375.png`、`announcements-preview-mobile-375.png`。演示与测试公告不构成真实官方事件；测试产生的公告已归档，关联测试软件已下线。

归档/缺失公告的 API 返回 404；Next.js 已开始流式传输时页面可能维持 200，缺失页有 noindex 和恢复入口。演示公告详情设为 noindex，不进入公告 sitemap。
