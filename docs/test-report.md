# 首轮交付验收记录

日期：2026-09-22。范围：规格第 122 节的首轮 10 项任务，外加轻量本地关注与安全跳转。后续更新发布、群公告、新用户向导、合集、完整 FAQ 与统计尚未实现，不计入本次验收。

## 已执行

| 检查 | 结果 | 实际环境 / 证据 |
| --- | --- | --- |
| TypeScript 类型检查 | 通过 | `npm run typecheck` |
| ESLint | 通过 | `npm run lint` |
| Next.js 生产构建 | 通过 | Next.js 16.3.5，Node.js 24.20；全部公开及管理路由构建成功 |
| 后端单元与 API 测试 | 38 项通过 | Python 3.14、pytest；认证、CSRF、数据维护、隔离、上传、URL、UTC 时间序列化等 |
| 真实 PostgreSQL | 26 项断言通过 | PostgreSQL 17.10 / psycopg；临时回环 55432，无系统服务 |
| Alembic | 通过 | SQLite 与 PostgreSQL 实际 upgrade；PostgreSQL downgrade → upgrade → check 无模型差异 |
| 种子幂等性 | 通过 | 首次 12 款软件，第二次 0 条新增；原有资料保持 |
| 公开站点浏览器 | 7 组路径通过 | Edge / Playwright，开发服务和生产构建服务均通过；`artifacts/public-e2e-results.json` |
| 管理员浏览器 | 10 组路径通过 | Edge / Playwright；`artifacts/admin-e2e-result.json` |
| 手机界面 | 通过 | 375px 与 393px 公开页面；375px 后台列表、编辑器及保存操作；无页面横向溢出 |
| 浏览器脚本异常 | 未发现 | 两套 E2E 的 pageerror 均为空 |
| 截图检查 | 已人工查看 | 首页、详情、软件库、桌面后台和手机后台截图位于 `artifacts/` |
| Docker / CI 配置 | 仅静态检查 | Compose 与 Actions YAML 解析成功；生产 API / PostgreSQL / Web 不公开端口 |

后端测试运行：进入 `apps/api` 后执行 `.venv/Scripts/python -m pytest -q`。最终 38 项通过，包含 SQLite 与 PostgreSQL 一致的 UTC 时间序列化回归检查。依赖有两条 TestClient/AnyIO 弃用提示，不影响通过。

## 已验证用户路径

- 输入 `VSCode`、`写代码`、`蓝色代码编辑器` 可以定位 VS Code。
- 分类与平台组合筛选可用；无结果时可以返回软件库。
- 关注后刷新仍保留；“我的软件”显示保存的条目。
- 详情显示用途、系统、别名、演示资料提示、官方入口；新标签、`noopener noreferrer` 正常。
- 官方跳转仅接受数据库登记 ID；任意 URL 查询参数、无效链接或下线软件被拒绝。
- 缺失详情显示中文恢复入口；API 返回 404，公开页面包含 noindex。Next.js 已开始流式响应时，页面 HTTP 状态可能为 200，这是本次已记录的框架行为。
- 管理员从 UI 登录、新建草稿、保存已有种子软件、创建分类、上传有效 PNG、发布、修改别名和官方 URL、下线、查看审计、退出。
- 下线后公开搜索不再展示，详情 API 404，已登记官方跳转不再可用。后台保留测试资料和审计，测试分类已解除关联并删除。

## 运行状态与边界

本机预览使用 SQLite 开发库，独立 PostgreSQL 验证库已关闭；不能把预览数据库误认成生产部署。管理员凭据仅在本机忽略目录 `runtime/local-admin.json`，未写入源码。`runtime/`、数据库、上传和截图均由 `.gitignore` 排除。

没有 Docker CLI，因此没有实际执行容器镜像、Compose 服务启动、Caddy 证书与 TLS、Linux 文件卷权限、每日备份和恢复脚本；CI 尚未推送执行。监控接入、负载与性能指标、严格 CSP nonce、生产安全验收留待第四轮。

浏览器测试与复现见 `tests/README.md`；PostgreSQL 测试及保护条件见 `docs/test-postgres.md`。演示数据版本为 `DEMO`，不代表实际官方最新版本。
