# 浏览器与集成检查

后端单元 / API 测试在 `apps/api/tests`。先按 README 迁移数据库并执行 seed，再启动 API 和 Web。

```powershell
apps/api/.venv/Scripts/python -m pip install -r tests/requirements.txt
apps/api/.venv/Scripts/python -m playwright install chromium
apps/api/.venv/Scripts/python tests/public_e2e.py
apps/api/.venv/Scripts/python tests/admin_e2e.py
apps/api/.venv/Scripts/python tests/announcements_public_e2e.py
apps/api/.venv/Scripts/python tests/announcements_admin_e2e.py
apps/api/.venv/Scripts/python tests/product_workflow_e2e.py
apps/api/.venv/Scripts/python tests/content_discovery_e2e.py
```

Windows 若已安装系统 Microsoft Edge，脚本会优先使用该浏览器，无需下载 Chromium。默认 `http://localhost:3000`，可设置 `E2E_BASE_URL`。测试只应对本地开发或隔离测试库运行。

公开路径检查：名称 / 别名 / 用途搜索、系统及分类筛选、空状态、关注持久化、我的软件、详情、官方入口在新标签打开、错误链接拒绝、缺失内容 noindex、375px 与 393px 手机导航与无横向溢出。官方目标被浏览器拦截以避免依赖外站。

后台路径检查：通过 UI 登录、新建、上传、发布、编辑、下线、分类和审计。使用测试管理员，凭据从环境或 `runtime/local-admin.json` 读取，不在脚本中保存固定密码。运行会创建测试资料，见脚本的清理逻辑。

内容与查找检查：从首页可见管理入口登录；通过 UI 创建两款演示软件和指南、FAQ、合集，验证预览不是发布、Escape 退出预览、人工发布、已发布编辑锁定、合集排序和公开页面。公开端检查用途搜索、系统筛选、空状态、FAQ 搜索、按需关注与刷新保持、393px 新手三步、375/393px 阅读与键盘导航；最后从 UI 下线并验证公开缺失页。`content_discovery_e2e.py` 和 `product_workflow_e2e.py` 的核心样本均由 UI 创建，API 仅用于读事实与清理自己本轮样本。

版本任务检查：当前版本与历史补录分离、同日历史不覆盖当前、缺日期阻止发布、503 保存后保留输入、复制通知、关注失败反馈与官方链接错误恢复，见 `product_workflow_e2e.py`。历史细项脚本保留用于对应范围回归，不能用它们替代完整可见 UI 任务验收。

公告路径检查：公告优先首页、置顶与筛选、关联软件搜索、影响与行动建议、链接复制、关注公告、手机阅读；后台检查草稿 / 待审核 / 预览 / 人工确认发布、版本同步、两种格式剪贴板内容、修改、归档及通用维护公告。先运行 `python -m app.cli seed-updates` 导入演示公告。

截图及 JSON 结果输出到 `artifacts/`，该目录不进入版本库。Next.js 流式缺失页面可能已发出 HTTP 200，因此检查 API 404、缺失页面文案和 robots noindex，而不是错误要求已开始流式响应后改变状态码。

核心内容脚本会将自己创建的内容归档、软件下线，并报告清理失败；不会编辑或下线已有资料。测试管理员凭据可通过 `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` 注入。CI 使用一次性本机测试账号与数据库；外站链接被拦截的用例不声称验证了厂商服务器。

数据库迁移、原生恢复与容器脚本说明见 [`../docs/test-postgres.md`](../docs/test-postgres.md) 和 [`../docs/deployment.md`](../docs/deployment.md)。本轮结果见 [`../docs/full-product-test-report.md`](../docs/full-product-test-report.md)。本机没有 Docker CLI，CI 配置更新需在远程 runner 真正运行后才算通过。
