# 更新小站：启动与运营

此轮入口为「最新、软件、公告」及 `/admin`。沿用仓库的 Next.js、TypeScript、FastAPI、SQLAlchemy、Alembic 和 Argon2id。访客免登录，管理员登录后维护内容；示例不提供真实下载地址。

## 本地启动（Windows PowerShell）

要求 Node.js 22+、Python 3.13+。以下命令从仓库根目录执行。已有依赖可跳过安装。

```powershell
npm ci
py -3.14 -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
./scripts/station-init.ps1 -CreateAdmin
```

初始化会迁移数据库、添加可重复执行的中文示例数据，然后交互式询问管理邮箱及密码（至少 12 位）。密码不会回显或以明文入库。已有账号不会被覆盖。若只需重新迁移，省略 `-CreateAdmin`；不需要示例时使用 `-SkipDemo`。

分别打开两个终端：

```powershell
# 终端一
./scripts/station-dev.ps1 -Component api

# 终端二
./scripts/station-dev.ps1 -Component web
```

访问 [更新小站](http://localhost:3010) 和 [管理后台](http://localhost:3010/admin)。API 为 `http://127.0.0.1:8010`，`/health` 检查进程，`/ready` 检查数据库及迁移。两个终端按 Ctrl+C 停止。服务重启沿用同一个数据库和上传目录。

默认站点库为 `runtime/station.db`，图片为 `runtime/station-uploads/`；不会覆盖仓库原有 `apps/api/runtime.db`。这些运行数据已由 `.gitignore` 排除。不要删除 `runtime/`，也不要把明文管理员凭据、数据库或上传内容提交到 Git。

## 配置

初始化及启动脚本只为尚未设置的变量提供默认值。可在终端先设置环境变量，再运行脚本；`.env.station.example` 是配置示例，不会被脚本自动载入。API 也会读取其工作目录 `apps/api/.env`，环境变量优先。

| 变量 | 本地默认 / 用途 |
| --- | --- |
| `DATABASE_URL` | `sqlite:///D:/.../updatehub/runtime/station.db`；脚本生成绝对路径 |
| `UPLOAD_DIR` | `D:/.../updatehub/runtime/station-uploads`；图片必须持久保存 |
| `PUBLIC_SITE_URL` | `http://localhost:3010`；部署时为真实 HTTPS 域名 |
| `CORS_ORIGINS` | `http://localhost:3010,http://127.0.0.1:3010`；限定可信管理来源 |
| `API_INTERNAL_URL` | `http://127.0.0.1:8010`；Next.js 连接 API 的内部地址 |
| `ENVIRONMENT` | 本地为 `development`，正式环境为 `production` |
| `SESSION_TTL_HOURS` | 默认 12 小时，管理员登录有效期 |
| `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` | 仅非交互初始化时临时提供；创建后从环境与配置文件删除 |

站名、简介和基础说明在后台「站点设置」保存。不要用 `SITE_NAME` 覆盖已保存的运营内容。`API_INTERNAL_URL` 影响 Next.js 转发配置，正式构建后改变时应重新构建。

## 发布一次软件更新

1. 管理后台进入「软件管理」。首次添加软件名称、固定链接标识、别名、简介、图标及支持设备，补充安装步骤和常见问题。固定标识发布后尽量保持不变，便于群内长期分享。
2. 在对应软件上选择「发布更新」，确认设备，填写版本号、一句话摘要和具体变化。核对该设备自己的获取链接、备用链接、来源、提取码及安装提醒；未提供真实链接时保持为空。
3. 可先「保存草稿」再「预览」。确认设备、版本与链接对应后发布；复制软件链接发到群内。新版本会更新首页和该设备的详情，旧版继续显示在「版本下载」中，并保留自己的获取链接、提取码和安装提醒。
4. 出现故障时，在「版本与下载」中将对应版本状态改为「暂时无法使用」，写明原因，发布关联提醒。用户会看到文字状态及不可用说明。

相同软件的安卓、电视、苹果、电脑版本分别维护。手机上选中「电视」时仍应获取电视版，不要把多个设备的链接混放进同一个按钮。上线前应由管理员亲自核对外部网站来源及可访问性。

## 发布一次公告

1. 进入「公告管理」，填写标题、摘要、正文，按需上传图片并添加链接。
2. 选择「群公告、使用提醒、维护通知」分类、重要程度、是否置顶、到期时间，并关联受影响的软件。
3. 保存草稿并预览，确认后发布，复制独立公告链接分享到群内。需要停止展示时撤回。到期公告自动退出有效置顶，历史链接保留并显示「已结束」。

粘贴正文按纯文字段落处理；不要粘贴脚本或任意 HTML。图片通过上传按钮真实保存。表单失败时保留已填内容，先按错误提示修改，再保存。

## 在群内打开

用户遇到应用内无法跳转时，可使用「复制链接」，再在系统浏览器粘贴打开。不能假定网站可以自动唤起外部浏览器。剪贴板权限不可用时，复制组件提供可选择的链接供手动复制。获取按钮附近显示实际来源、安装提醒和提取码；示例内容始终标识为示例，未配置链接不模拟下载。

## 部署

正式环境使用 PostgreSQL 和持久化上传卷，不能依赖平台临时文件系统。项目配置在 `ENVIRONMENT=production` 时强制要求显式 PostgreSQL 连接串和 HTTPS `PUBLIC_SITE_URL`。保留现有 Docker Compose、Caddy 及备份结构，详见 [部署与恢复](deployment.md)。

1. 使用独立的强数据库密码与管理员密码，在服务器安全配置环境变量。配置真实域名、TLS、站点 URL、可信来源及持久化数据库/上传卷。
2. 构建镜像，启动前执行 `alembic upgrade head`。首次演示可执行 `python -m app.cli seed-station`；真实运营可跳过演示。执行 `python -m app.cli create-admin` 初始化账号。
3. 确认 Next.js 的 `/api/v1` 与 `/uploads` 同源转发至 API。API 不必直接向公网暴露。变更反向代理时保留真实客户端地址配置及安全响应头。
4. 移除初始管理员明文密码并重新创建 API 容器。检查 `/ready`、管理员登录、上传、软件分享链接及 HTTPS 外部获取链接。
5. 正式运营前替换示例软件与公告，核对链接授权及来源；再将域名放进群公告。

本机浏览器和 SQLite 验证不等于生产 PostgreSQL、容器、TLS 或小红书真实客户端验收。需要在实际部署环境追加上述检查。

## 备份与恢复

本地 SQLite：先停止 API（避免数据库与图片在快照过程中发生不同步），再执行：

```powershell
apps/api/.venv/Scripts/python.exe scripts/station-backup.py
```

输出位于 `runtime/station-backups/`，包含数据库、图片、校验清单和 ZIP。数据库通过 SQLite 备份接口复制并执行完整性校验。若设置了自定义路径，传入 `--database`、`--uploads`、`--output`。备份包含账号密码散列及会话数据，限制访问并加密复制到另一台机器；不要只备份代码。

恢复时先停止 API，将当前数据库和上传目录复制到另一处保存，然后把同一份备份的 `station.db` 和 `station-uploads` 恢复到其配置路径。执行数据库迁移后再启动，逐项确认软件、公告、图片和登录。备份中的会话也会恢复；安全事故恢复时应撤销历史会话并重新登录。不要用 SQLite 文件直接替换 PostgreSQL 数据。

正式 PostgreSQL 按 [部署与恢复](deployment.md) 使用仓库 `infra/scripts/backup.sh`、`restore.sh`；数据库与图片必须作为同一次备份管理。建议每日备份、保留最近 7 日及每周快照，定期在独立环境演练恢复。

## 广告扩展

广告默认关闭。首页列表中部、软件详情正文、桌面侧栏通过独立广告组件接入；关闭、过期、加载失败时自然收起。`/promo/{slug}` 提供统一风格的推广页结构。广告记录与软件获取入口分开保存，不应通过替换下载 URL 实现推广。

接入位置：`apps/web/components/station/ad-slot.tsx` 接收总开关、推广数据及位置，位置标识为 `home_feed`、`detail_body`、`desktop_sidebar`；首页在 `listing.tsx`，软件正文在 `software-detail.tsx`，推广页在 `app/promo/[slug]/page.tsx`。数据表为 `station_promotion`，公开数据由 `/api/v1/station/data` 的 `promotions` 返回，`settings.ads_enabled` 为总开关。接口会过滤未上线或非投放期内容；图片加载失败仅收起推广组件。

后台「广告与推广」现已支持素材上传、位置多选、目标 URL、开始/结束时间、保存草稿、预览、上线与撤回。总开关默认关闭，独立控制全部推广及活动页。操作顺序：新建推广 → 填写标题与活动链接 → 上传封面 → 选择位置与时间 → 预览并发布 → 在列表启用广告。草稿不会公开，到期自动退出广告位，历史活动页标注已结束；关闭总开关后活动页也下线。同一位置按分享链接标识排序选择首条有效活动。

第三方服务可在 `apps/web/lib/advertising.ts` 的 `AdProvider` 契约接入，沿用 `AdPlacement` 和 `AdSlot` 的总开关、延迟加载与失败隔离。修改第三方域名/脚本前需调整 CSP。未接入第三方广告平台、点击统计、计费或下载前广告中转。推广按钮必须标注「广告」或「推广」，素材设置固定比例。若增加下载前中转，需要另行设计并保留软件 ID、所选设备及明确的「继续获取软件」入口。

## 验证

实际执行记录与限制见 [本轮验证](station-verification.md)。浏览器脚本仅操作自己创建的带唯一标记的测试软件和公告，在最后下架/撤回；不要把未经审阅的浏览器测试直接指向生产。

## 新版版本下载与界面（2026-10-15）

软件详情按「选择设备 → 版本下载 → 更新内容与获取入口 → 安装方法」组织。每个旧版均可选中，页面来源、链接、提取码、安装提醒及手机底部按钮同步切换。URL 中的 `platform` 和 `release` 可直接分享、刷新；不带版本参数的固定软件链接始终选择对应设备的最新版。停止某一旧版服务时修改该版本的使用状态；撤回则从公开版本列表隐藏。

后台「版本与下载」可按软件、设备筛选，显示最新版/历史版、状态和入口数量。新版本沿用前一版本内容后，请核对并替换为本版本链接。原 A/B/C 预览链接会跳转新版并保留设备和版本参数；`/designs` 返回新版首页。

开发时可选 `NEXT_DIST_DIR` 设置独立构建目录（默认 `.next`），用于并行验收。正常启动不需要此变量。新版设计及验证见 `station-versions-redesign.md`。
