# 版本喵 v4 · 软件更新与群公告

代码仓库：[GitHub · jayson2hu/updatehub](https://github.com/jayson2hu/updatehub)（公开，可匿名克隆）。默认分支 `main`，开发分支 `feature/v4`；新机器克隆、验证和待配置项见 [仓库接手说明](docs/repository-handoff.md)。

面向中文手机用户的软件更新站：按设备与版本获取、安装图文、群公告、收藏同步、匿名反馈和 v5 管理工作台。站名与介绍可配置，访客免登录。本轮日常库有 9 款示例软件、17 条版本、4 条公告；未配置真实链接时不会模拟下载。广告默认关闭，位置、素材与聚合统计独立管理。

沿用 Next.js、TypeScript、FastAPI、SQLAlchemy、Alembic、Argon2id。新版使用独立 `station_*` 数据表，保留原有代码与数据库；本地运行数据在 `runtime/station.db`，上传图片在 `runtime/station-uploads/`。

当前沿用已实施的 v4 前台和 v5 后台。50 套探索稿及旧 UpdateHub 代码保留作历史资料，旧入口默认下线；`/designs/*` 统一跳回首页，不再作为现行体验入口。

微信和小红书小程序共用现有后台：执行 `npm run mini:build`，分别将 `apps/miniprogram-wechat` 与 `apps/miniprogram-xhs` 导入对应开发工具。配置、分享、外链和验证范围见 [双平台小程序说明](docs/station-miniprograms.md)。

## 本轮快速启动

在本目录执行（Node.js 22+、Python 3.13+，Windows PowerShell）：

```powershell
npm ci
py -3.14 -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
./scripts/station-init.ps1 -CreateAdmin
```

初始化时按提示输入管理邮箱及至少 12 位密码。然后分别在两个终端运行：

```powershell
./scripts/station-dev.ps1 -Component api
./scripts/station-preview.ps1 -Rebuild
```

前台：[http://localhost:3011](http://localhost:3011)；后台：[http://localhost:3011/admin](http://localhost:3011/admin)。需要热更新时改用 `./scripts/station-dev.ps1 -Component web`，默认 3010。现有工作区本地账号在已忽略的 `runtime/station-admin.json`，不输出、不提交、不用于正式部署。

完整说明见 [启动、发布操作与备份](docs/station-operations.md)、[环境变量示例](.env.station.example)、[双平台小程序](docs/station-miniprograms.md)、[部署与恢复](docs/deployment.md)。

## 正式部署与安全交接（2026-10-20）

**正式首次上线为空内容**：仅迁移表结构、必要配置并创建独立生产管理员，不导入开发库/图片/账号，不执行 seed。本站只维护软件或独立服务的通知和入口，不接入听书目录、章节、音频或第三方凭据。开发环境可继续录入，与生产分离。

后续交给 Codex 部署时，从 [容器部署交接手册](docs/container-deployment-handoff.md) 开始，使用 [.env.production.example](.env.production.example)。手册包含准备清单、空站部署、备份/恢复、验收和可复制的部署任务。源码打包：`apps/api/.venv/Scripts/python.exe scripts/package-station-release.py`，自动排除运行数据与秘密并生成 SHA-256 清单。

本轮安全修复：5 个受影响 Python 包已升级，npm/pip 扫描未报告已知漏洞；Bandit 无发现；API 全量 169 项及随后新增空站测试所在专项 28 项通过（两组有重叠），部署配置 4 项通过，小程序 7+50 项通过。范围与剩余风险见 [安全检测报告](docs/security-review-20261020.md)。本机未构建/运行生产容器，真实 TLS、镜像/OS 漏洞和服务器验收仍待部署时完成。下方 142 项等为此前产品验收记录。

代码入库前已再次运行 API 全量 **170 passed**、Web lint/类型检查和部署配置检查，详见 [推送前检查](docs/repository-handoff.md#首次推送前检查记录)。

## 当前验证与交付边界

- API **142 通过**；小程序发布配置 **7 通过**、两端构建及逻辑 **50 通过，无跳过**；Web lint、类型检查与正式构建通过。发布脚本支持 `--check` 只读检查，拒绝错误地址/参数并规范化地址尾斜线。
- 隔离 HTTP 验证创建、草稿、发布、多设备/多版本、公告到期与撤回；实际重启验证数据、图片、同步码及签名凭据保留。备份已恢复到独立目录验证。
- 浏览器 **17 组通过、29 张截图、0 页面运行错误**；另有日常站点只读截图 6 张。已检查 360/390/768/1440 前台和 1280/1440 后台，修复搜索/返回点击区和辅助文字对比度，并同步两端小程序样式。
- 首页与详情初始 HTML/CSS/JS gzip 分别约 **173 / 185 KiB**（现代浏览器，含水合依赖）；模拟慢 4G 的 LCP 分别 **984ms / 604ms**，CLS 均 **0**。50 款软件、500 版本的本机 SQLite 接口 P95 **73.7ms**。这些是本地测量，不代表公网或生产负载。
- 本机真实 PostgreSQL 17 **6 组通过**，覆盖迁移、生产 API 配置、发布与批量回滚、公告、pg_dump/pg_restore；恢复前后 **28 张表**的行数及内容摘要一致，新进程读取数据、图片及签名凭据正常。
- 浏览器启动限制已通过正常审批解决。微信/小红书原生编译、真机及生产部署验收仍待完成；用户确认暂缺 AppID、HTTPS 域名，两端开发包与配置说明已准备，不据此宣称整体验收完成。

验收证据及复跑命令以 [v4 测试与验收](docs/v4/05-测试与验收.md) 为准，进度见 [开发进度](docs/v4/04-开发进度.md)。网站本地核心验收已通过，可打开上述地址审查；原生与正式上线验收仍有明确待办。下方仅为旧版历史资料，现行启动与运营遵循上述文档。

---

## 原有 UpdateHub 项目资料

UpdateHub 面向固定用户群，集中发布软件更新、使用提醒和维护通知，让读者快速判断“发生了什么、是否影响我、现在该怎么做”。软件档案与官方入口为公告提供背景和行动渠道。

本轮根据用户反馈调整为公告优先：首页与 `/updates` 展示公告，`/update/{slug}` 展示影响、建议、变化与来源；后台围绕草稿、审核、发布、修改、归档和复制群通知维护内容。完整定位与验收条件见 [`docs/product-positioning.md`](docs/product-positioning.md) 和 [`docs/announcement-acceptance.md`](docs/announcement-acceptance.md)。

本轮增加用途查找、新手三步引导、指南、常见问题、场景合集，以及后台内容维护与运营工作台。最新验收见 [`docs/full-product-test-report.md`](docs/full-product-test-report.md)；公告与首轮报告保留为历史记录。种子内容均为演示资料，不代表真实官方消息或当前最新版本，本站不托管安装包。自动版本检测、主动消息发送、广告和普通用户账号不在当前交付范围，生产验收尚未完成。

## 当前使用流程

管理员从“软件管理 → 版本管理”选择“发布新版本”或“补录历史版本”。软件资料和版本记录分别维护；历史补录不改变当前版本，也不混入默认最新公告。版本表单自动填写网址标识和关联软件，保存后预览，再人工确认发布。

访客先看当前版本、建议与官方入口，再按需回看历史。旧公告会说明它保留的是当时的建议。验收以这些完整任务及失败恢复为准，见 [`docs/product-acceptance.md`](docs/product-acceptance.md)；之前的测试记录保留为历史证据。

不知道软件名称时，可从“软件档案 → 帮我找软件”输入用途和线索；“帮助中心”提供新手开始、指南、常见问题和软件合集。新手流程按系统、用途推荐清单，只有明确勾选并确认的软件才进入本机关注。指南、问题和合集在后台保存草稿、预览并人工确认发布；已发布内容下线后才能修改，修改后需再次发布。

## 技术与目录

- Web：Next.js 16、React、TypeScript，位于 `apps/web`。
- API：FastAPI、SQLAlchemy 2、Alembic、Argon2id，位于 `apps/api`。
- 默认数据库：PostgreSQL 17；本地可显式使用 SQLite 做开发验证。
- 部署：Docker Compose、Caddy HTTPS、持久化数据库与图标卷。

```text
apps/web/             公告中心、软件档案与管理员界面
apps/api/             API、模型、迁移、种子与测试
packages/             共享代码预留
infra/                镜像、反向代理、备份与恢复脚本
docs/                 产品原文、实施计划、接口契约与使用文档
```

## 旧版 Docker 本地开发启动（非正式部署）

以下仅为旧版本地演示资料，含示例导入命令，**不得用于正式首次上线**。现行生产请用上方容器交接手册。要求 Docker Engine 与 Compose v2；命令在仓库根目录执行，`.env` 不应提交到版本库。

1. 将 `.env.example` 复制为 `.env`。运行 `python -c "import secrets; print(secrets.token_hex(32))"`，将结果填入 `POSTGRES_PASSWORD`。数据库密码使用生成的十六进制内容，避免连接串转义问题。会话使用随机不透明 token 与服务端散列，不需要 `SECRET_KEY`。
2. 设置 `ADMIN_INITIAL_EMAIL` 与独立的强密码 `ADMIN_INITIAL_PASSWORD`。
3. 启动并初始化：

```sh
docker compose up -d --build
docker compose exec api python -m app.cli seed
docker compose exec api python -m app.cli seed-content
docker compose exec api python -m app.cli create-admin
```

访问 [公开站点](http://localhost:3000)、[管理后台](http://localhost:3000/admin)、[API 健康检查](http://localhost:8000/health)、[API 就绪检查](http://localhost:8000/ready)。API 启动时先执行 Alembic 迁移；迁移失败不会继续启动。种子命令可重复执行，管理员不会由种子自动创建。

创建账号后，删除 `.env` 中的初始管理员密码，并执行 `docker compose up -d --force-recreate api`，使运行容器也不再保留该密码。现有管理员使用数据库中的密码散列登录。

普通停止使用 `docker compose down`。不要在希望保留数据时添加 `--volumes`。

## 本机开发

要求 Node.js 24、Python 3.13+。默认推荐 PostgreSQL；下面是无 Docker 环境下的 Windows PowerShell 开发路径，显式使用 SQLite。SQLite 通过不代表 PostgreSQL 集成通过。

```powershell
# 仓库根目录
npm ci
cd apps/api
py -3.14 -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt
$env:DATABASE_URL = "sqlite:///./updatehub.db"
$env:PUBLIC_SITE_URL = "http://localhost:3000"
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m app.cli seed
.venv/Scripts/python -m app.cli seed-content
$env:ADMIN_INITIAL_EMAIL = "你的管理邮箱"
$env:ADMIN_INITIAL_PASSWORD = Read-Host "设置管理员密码" -MaskInput
.venv/Scripts/python -m app.cli create-admin
Remove-Item Env:ADMIN_INITIAL_PASSWORD
.venv/Scripts/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

另开一个终端，在仓库根目录运行：

```powershell
$env:API_INTERNAL_URL = "http://127.0.0.1:8000"
$env:NEXT_TELEMETRY_DISABLED = "1"
npm run dev
```

浏览器访问 `http://localhost:3000`；公开数据来自 API。前端通过同源转发访问 `/api/v1`、`/go` 与 `/uploads`。API 本机设置从 `apps/api/.env` 或进程环境读取；根目录 `.env` 用于 Compose，不能假定 API 自动读取它。

本次工作区的既有预览实际使用 `apps/api/runtime.db`，相关备份保存在已忽略的 `runtime/` 中。上面的 `updatehub.db` 是全新开发示例；维护既有预览时应保留其实际连接串，先备份，再对原库执行迁移。切换到一个新文件会看到新的资料集，并不表示原库内容已丢失。

如使用本机 PostgreSQL，将 `DATABASE_URL` 改为 `postgresql+psycopg://用户名:已编码密码@127.0.0.1:5432/数据库名` 后重新运行迁移与种子。不要将 SQLite 文件直接复制为 PostgreSQL 数据库。

## 配置与检查

`SITE_NAME` / `SITE_DESCRIPTION` 控制站名与介绍，`PUBLIC_SITE_URL` 是浏览器实际访问的地址。生产必须为 HTTPS。`API_INTERNAL_URL` 是 Web 服务访问 API 的内部地址；Next.js 转发目标参与构建，修改目标后需要重建 Web。

```sh
# 仓库根目录
npm run lint
npm run typecheck
npm run build

# apps/api，使用已安装依赖的 Python
python -m pytest -q
```

测试方法见 [`tests/README.md`](tests/README.md)，真实 PostgreSQL 的迁移、数据往返和备份恢复复现见 [PostgreSQL 验证说明](docs/test-postgres.md)。本轮结果以 [交付验收记录](docs/full-product-test-report.md) 为准，旧报告中的数量只代表对应历史版本。

CI 配置了 Web 检查、PostgreSQL 迁移、重复种子、API 测试、可见 UI 浏览器任务，以及生产镜像启动、数据卷写入和备份恢复脚本检查。流水线文件存在不代表已经运行通过。本机已完成原生 PostgreSQL 备份恢复演练；由于没有 Docker CLI，容器脚本、镜像、Caddy TLS 和正式域名仍须在 Docker 主机验收。

`/health` 仅确认应用进程存活；`/ready` 同时要求数据库可用且迁移 revision 与当前代码一致。运营统计只保存按日汇总的搜索词、无结果搜索与官方入口点击次数，具体保留策略和部署监控见 [部署与恢复](docs/deployment.md)。

进一步阅读：[架构与 ERD](docs/architecture.md)、[部署与恢复](docs/deployment.md)、[管理员操作](docs/admin-guide.md)、[安全边界](docs/security.md)、[接口契约](docs/api-contract.md)、[实施计划](docs/implementation-plan.md)。
