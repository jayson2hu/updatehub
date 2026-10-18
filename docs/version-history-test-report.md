# 版本历史线验收记录

日期：2026-09-22。状态：版本历史线本地验收完成，新增浏览器检查与公告回归均通过。首轮及公告中心原有报告保留，不替代本次实际检查。

| 检查 | 状态 | 验证方式 |
| --- | --- | --- |
| VS Code 演示历史 | 通过 | 实际读取至少 4 条公开版本记录，API 与软件详情顺序一致 |
| 历史日期与类型隔离 | 通过 | 6 条演示更新按 6、2、5、1、4、3 顺序发布，最旧记录置顶；历史仍按日期 6→1 排列，排除另建使用提醒 |
| 旧版跳转与阅读标识 | 通过 | 点击版本 3 的历史条目，进入对应公告并标记“正在阅读”；档案当前版本仍为版本 6 |
| 软件档案历史 | 通过 | 公告与软件详情展示同一历史来源；软件详情不会错误标记某条为当前阅读 |
| 零条与分页 | 通过 | 新测试软件显示真实空状态；6 条记录按 5+1 分页，链接包含 history_page 与区块锚点；越界 / 非数字参数恢复可用内容 |
| 375px / 393px | 通过 | 阅读、分页、软件档案路径均无页面横向溢出 |
| 脚本异常与清理 | 通过 | 最终 JSON 的 browser_errors 与 cleanup_errors 均为空；归档本脚本公告、下线本脚本软件、退出独立测试会话 |
| 版本历史浏览器 | 9 组通过 | `tests/version_history_e2e.py`；`artifacts/version-history-e2e.json` |
| 公告公开页面回归 | 9 组通过 | 历史测试清理后顺序运行 `tests/announcements_public_e2e.py`；`artifacts/announcements-public-e2e.json` |
| 后端完整测试 | 56 项通过 | API 代理执行 `python -m pytest -q`，包括历史隔离、排序与分页 |
| 真实 PostgreSQL | 86 项断言通过 | PostgreSQL 17.10，隔离回环 55439；包含 UTC 日期回退、历史分页与权限、迁移往返及 check 无差异，测试实例已停止 |
| 前端 lint / 类型 / 构建 | 全部通过 | 主代理执行 `npm run lint`、`npm run typecheck`、`npm run build` |
| 演示种子幂等性 | 通过 | 新增 3 条 VS Code 历史后再次导入，新增 0 条，原有记录保留 |

运行命令：`apps/api/.venv/Scripts/python tests/version_history_e2e.py`。本次使用 Microsoft Edge / Python Playwright、1440px 桌面及 375px / 393px 手机上下文，连接 `http://localhost:3000` 本机服务和开发数据库。可通过 `E2E_BASE_URL` 指定其他本机测试地址。脚本没有启动或重启服务。

凭据在进程内读取 `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` 或本机忽略文件 `runtime/local-admin.json`，未写入源码与结果。每次创建 1 款独立演示软件、6 条演示版本公告和 1 条演示使用提醒，不修改 VS Code 种子或其他已有软件。首次运行与复测创建的测试公告均已归档、测试软件均已下线，后台保留必要审计记录。

## 截图与复测说明

实际截图位于 `artifacts/version-history-desktop.png`、`version-history-mobile-375.png`、`version-history-mobile-393.png`。测试代理与主代理均查看了最终桌面 / 375px 截图，日期、建议、演示标签、分页以及“正在阅读 3 / 档案当前 6”层次清楚，无内容裁切。主代理还查看了真实种子截图 `artifacts/history-review-desktop.png` 和 `history-review-mobile.png`，4 个节点完整，375px 无溢出。

最终视觉复核后，主代理仅调整 `version-history.css` 的小字颜色：次要文字加深为 `#586f60`（上下文背景对比度 5.09:1），“正在阅读”徽标使用深绿色（5.75:1），演示标识改为 `#71644e`（5.48:1），并加深暂缓 / 可选建议文字。主代理已在浏览器确认新样式生效，重新核对 4 个历史节点与 375px 无溢出，并更新两张 `history-review-*` 截图。此次样式修正未改变功能，未重复运行完整浏览器测试。

首次浏览器运行在分页链接点击后立即读取 URL，尚未等待 Next.js 客户端导航完成，导致脚本断言失败。已改为 Playwright 等待 URL 变化后检查数据，复测 9 组全部通过；期间未发现未捕获的浏览器脚本错误。旧公告回归中，将软件关联公告标题选择器限制到 `.software-announcements`，避免新增历史线出现相同公告标题后产生重复匹配；顺序回归 9 组通过。

截图展示的是演示或受控测试版本，不能当作真实官方版本事实。浏览器检查、56 项后端测试与 86 项数据库断言是不同验证层，数量不应混加成用户用例数。本次不包含 Docker、HTTPS、备份恢复或生产部署验收。
