# 版本喵 v4：启动与运营

前台为「首页、软件库、公告、我的」，后台为 `/admin`。默认名称「版本喵」，可在站点设置修改。沿用 Claude 的 v4 前台与 v5 工作台；早期 50 套设计代码保留作历史资料，`/designs/*` 现统一跳回首页。

技术：Next.js 16、React 19、TypeScript、FastAPI、SQLAlchemy、Alembic、Argon2id。访客免登录；管理写操作由 API 验证身份、来源与 CSRF。演示内容标注示例，未配置真实地址时不提供假下载。

## 本地启动

要求 Node.js 22+、Python 3.13+（本轮实测 Node 24 / Python 3.14）。在仓库根目录执行，已有依赖可跳过安装：

```powershell
npm ci
py -3.14 -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
./scripts/station-init.ps1 -CreateAdmin
```

初始化迁移数据库、导入可重复执行的中文示例，然后交互询问管理员邮箱和至少 12 位密码。密码不会回显或明文入库；已有账号不覆盖。不需要示例时加 `-SkipDemo`；已有管理员仅迁移时省略 `-CreateAdmin`。

打开两个终端：

```powershell
# 终端一：API
./scripts/station-dev.ps1 -Component api

# 终端二：正式构建预览（首次自动构建；代码有修改时加 -Rebuild）
./scripts/station-preview.ps1 -Rebuild
```

网站 [http://localhost:3011/](http://localhost:3011/)，后台 [http://localhost:3011/admin](http://localhost:3011/admin)。API 为 `127.0.0.1:8010`，`/ready` 检查数据库与迁移。两个终端按 Ctrl+C 停止。

需要热更新时，第二个终端改为 `./scripts/station-dev.ps1 -Component web`，访问 3010。也可加 `-Port 3011`，先停止已占用该端口的预览。`station-preview.ps1` 使用 `.station-preview` 的 standalone 构建，Windows 环境默认使用线程编译；不依赖热更新服务。

日常库：`runtime/station.db`；图片：`runtime/station-uploads/`；开发反馈签名密钥：`runtime/station-signing.key`（未设置环境密钥时，在首次匿名反馈生成凭据时创建，尚未有反馈时文件可以不存在）。服务重启沿用这些路径。原 `apps/api/runtime.db` 保留。运行数据、密钥、本地初始化凭据和验收产物不入 Git。

## 环境变量

配置示例：[本地环境](../.env.station.example)和 [Compose 环境](../.env.example)。PowerShell 脚本不会自动加载示例文件；先设置环境变量。API 另读取 `apps/api/.env`，进程变量优先。

| 变量 | 用途 |
| --- | --- |
| `DATABASE_URL` | 本地脚本默认绝对路径 SQLite；生产显式配置 PostgreSQL |
| `UPLOAD_DIR` | 上传目录，必须持久化 |
| `PUBLIC_SITE_URL` | 对外网站地址；预览脚本默认 `http://localhost:3011`，生产必须 HTTPS |
| `CORS_ORIGINS` | 精确可信来源，默认本地 3010/3011；不能设 `*` |
| `API_INTERNAL_URL` | Web 转发至 API 的内部地址，默认 `http://127.0.0.1:8010`；改变后重建 Web |
| `ENVIRONMENT` | `development` / `production` |
| `STATION_SIGNING_KEY` | 正式环境必须 ≥32 个随机字符；所有实例相同且持久保存。开发未设时自动生成本地文件 |
| `MINIAPP_REFERER_PREFIXES` | 正式小程序匿名写入允许的精确 HTTPS Referer 前缀，以 `/` 结尾，多项逗号分隔；拿到 AppID 后按平台实际请求配置 |
| `LEGACY_ENABLED` | 默认 `false`，旧 API 返回 410。恢复旧接口是单独的运维决定 |
| `SESSION_TTL_HOURS` | 管理会话默认 12 小时 |
| `ADMIN_INITIAL_EMAIL` / `ADMIN_INITIAL_PASSWORD` | 仅非交互创建管理员时临时使用，创建后删除 |
| `STATION_WORKER_THREADS` | Windows 无法 fork 编译进程时设 `true`；不改变运行时权限校验 |

站名、简介、Logo 首字、热门搜索、说明与页脚在后台配置。不要通过环境变量覆盖已持久化的站点内容。不要把 AppSecret 放进前端或小程序。

「搜索与访问提示」内，小红书提示条默认显示，下载按钮提供手动打开引导；微信提示为独立选项，默认关闭，官方入口直接打开。确认微信限制了跳转后，再开启「微信也显示引导并提示在浏览器打开」，按钮会同步改为引导。两个开关持久保存，互不覆盖；小程序不显示 Web 宿主提示。

## 发布一次软件更新

1. 首次在「软件管理 → 添加软件」填写名称、别名、用途、图标、支持设备、分类及教程。每个设备可有独立步骤、逐步配图、提示和 FAQ；保存草稿后访客不可见。发布后保留固定 slug，适合长期放在群公告。
2. 常规更新点左侧「发布更新」或软件行内同名操作。选择软件与设备，同版本可多选；每个设备填写自己的官方链接、版本号、一句话摘要和更新建议。快捷发布沿用上一版备用链接、提取码及系统要求，发布前核对。
3. 复杂内容点「保存草稿并在完整编辑页继续」。在「版本与下载」维护结构化变化、详细说明、来源名称、官方/网盘类型、提取码、是否启用及安装提醒。没有真实地址就留空。
4. 点「发布并复制群通知」，成功后出现提示，可直接粘贴到群里。复制被拒时窗口保留可全选的通知文本。完整编辑页也可保存草稿、预览和发布；已发布内容保存后立即生效。
5. 新版本出现在首页，对应设备切到最新版；旧版仍可选择与下载，保留各自的入口、提取码和安装提醒。软件分享路径固定为 `/software/{slug}`；指定旧版用 `?platform=tv&release={id}`。

「先别更新」必须选择同软件、同设备、已发布且可用的稳定版。前台主按钮指向稳定版，另有「仍要下载当前版本」；被引用的稳定版不能撤回或设为不可用，先修改引用它的更新。版本不可用时显示原因；下架软件会隐藏全部公开入口。

主入口使用官方链接；没有官方链接时主按钮禁用，已配置的非苹果备用入口仍可使用。所有公开入口支持复制；存在第二条官方地址时也会显示。小红书内点击下载会给出手动浏览器指引，不尝试自动唤起浏览器。

## 发布一次公告

1. 工作台点「发公告」快速填写标题、正文、分类、重要程度、置顶、到期时间和关联软件。
2. 需要配图、独立摘要或外链时，在「群公告」完整编辑页添加，支持草稿、预览、发布与修改。文本按安全段落渲染，不执行任意 HTML。
3. 发布并复制群通知，或复制独立路径 `/announcements/{slug}`。到期自动退出有效置顶，历史链接仍能打开并标「已结束」；撤回则访客不可访问。

## 日常处理

- 「工作台」显示访问、下载点击、待处理问题、收录请求和最近发布；数字按北京时间统计，人数为近似值。
- 「用户反馈」查看问题类型、设备、版本与来源（网站 / 微信 / 小红书），可筛选、批量处理。改投与撤销会同步调整计数；同一反馈补说明不重复计票。更新或移除失效链接时，对应链接问题自动标为已处理，其他问题保留。
- 「想要的软件」可改展示名称、合并请求、关联已上架软件，或新建后收录；状态会回到群友「我的」。合并后旧请求仍可查询。
- 收藏保存在本机。「我的」生成 30 天同步码，另一端输入即可合并收藏与设备偏好；重新生成使前码作废。同步码仅迁移收藏，不是登录凭据。

## 广告与后续接入

广告默认关闭，当前已提供素材/位置/时段管理、单位置开关及曝光/点击计数。首页第 3 条更新后、详情正文和桌面侧栏使用独立组件；关闭、过期、加载失败时收起。素材标「广告」，按钮与获取按钮区分，图片保留比例。关闭按钮对本次会话生效。

接入位置：`components/station/ad-slot.tsx`；首页 `home.tsx`，详情 `software-detail.tsx`；位置键 `home_feed`、`detail_body`、`desktop_sidebar`。数据为 `station_promotion`、公开 `StationData.promotions` 与 `settings.ads_enabled/ad_placements`。`/promo/{slug}` 是独立分享页，草稿/关闭总开关时不公开，到期历史页标结束。

曝光只在可见面积至少 50% 持续 1 秒时计数；无法确认可见性时不计，加载失败不计。统计为本站聚合数据，不含计费、第三方广告投放或归因。第三方接入需通过统一开关和独立 Provider，并按需调整 CSP；不修改软件下载字段。下载前广告中转尚未实现，需要另行设计并保留所选设备与版本。

## 部署与备份

生产配置、PostgreSQL、Caddy HTTPS、恢复流程见 [部署手册](deployment.md)。本轮未执行生产容器、TLS 签发或两平台原生发布。只有 AppID 和真实 HTTPS 域名配置完成后，才能进行原生和真机验收。

本地 SQLite 先停止 API，再执行：

```powershell
apps/api/.venv/Scripts/python.exe scripts/station-backup.py
```

输出 `runtime/station-backups/{UTC时间}.zip`，包含 SQLite 备份、上传图、manifest 和本地签名密钥（存在时）。自定义路径用 `--database / --uploads / --output / --signing-key`。生产环境从密钥库另行备份 `STATION_SIGNING_KEY`；仅备份数据库不能恢复反馈改投凭据。

恢复演练使用新目录，不覆盖在线数据：

```powershell
apps/api/.venv/Scripts/python.exe scripts/verify-station-backup.py --archive runtime/station-backups/实际时间.zip
```

脚本验证路径、数据库 SHA-256、完整性、迁移就绪、公开数据和所有图片字节，并保留隔离恢复目录。正式恢复先停止写入、保留当前库与图、校验同一次备份，再将数据库、图片和开发签名文件恢复到配置路径，迁移后启动。安全事故时撤销恢复的会话；不要将 SQLite 文件复制成 PostgreSQL 库。

备份含管理员散列和签名密钥，限制访问并加密保存到另一台机器。生产采用 `infra/scripts/backup.sh` / `restore.sh`，默认保留 14 天；密钥安全副本与数据同批记录。不要用 `docker compose down --volumes` 做日常停止。

## 验证与当前边界

最新证据见 [v4 测试与验收](v4/05-测试与验收.md)，进度见 [开发进度](v4/04-开发进度.md)。API 与小程序逻辑检查使用隔离库，真实 HTTP 已验证发布及进程重启后的数据/图片。浏览器经正常审批启动后 17 组通过、29 张截图，另有日常只读截图 6 张；慢 4G 模拟首页/详情 LCP 为 984ms/604ms，CLS 均为 0。本机 PostgreSQL 17 的 6 组验证及原生恢复通过，28 张表行数与摘要一致。原生小程序、真机及部署机 Docker/TLS 仍待验收。
