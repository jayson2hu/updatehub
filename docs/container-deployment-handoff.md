# 版本喵：容器部署交接与 Codex 操作手册

更新：2026-10-20。用途：准备将当前项目交给后续 Codex 在目标服务器部署。本次没有执行公网部署。

## 已确定的产品与数据边界

- **首次正式上线内容为空**：只执行数据库迁移、创建独立生产管理员，使用必要的站点默认配置。不导入示例软件、版本、公告、广告，不复制本地 SQLite、上传目录或开发管理员。后续再由管理员录入并发布。
- 当前开发环境与生产环境独立，开发环境可以继续补充内容；不能把“开发环境有内容”理解为允许迁移到生产。
- 版本喵只管理软件／服务通知和访问入口。`reverse-20261019` 的听书项目是独立服务参考，本站不引入有声书、章节、音频文件、第三方 Cookie 或媒体 token。将来有自己的服务网址，在相应软件／版本记录中维护入口和说明即可；有时效的章节签名地址不应当作长期服务入口。
- 广告默认关闭；备案号没有时留空，页面隐藏。域名、部署地区和网站／小程序上线手续按实际服务商及平台要求处理。

## 部署前需要准备什么

| 项目 | 要准备的内容 | 处理方式 |
| --- | --- | --- |
| 服务器 | Linux x86_64，建议至少 2 核 / 4 GB 内存 / 40 GB 磁盘；本机构建建议 4 核 / 8 GB | 磁盘需同时容纳镜像、数据库、上传和备份；不是已验证的容量上限 |
| 访问方式 | SSH 主机、端口、账号及受保护的私钥；具备 Docker 操作权限 | 不把私钥写入仓库、聊天或部署报告 |
| 域名 | 真实域名、DNS A/AAAA、部署地区 | AAAA 仅在服务器 IPv6 确实可达时配置 |
| 网络 | 80/443 TCP，443 UDP 可选；SSH 限管理员来源 | 不开放 5432、8000、3000；DNS/ACME及镜像源需可达 |
| 运行工具 | Docker Engine、Compose v2、Python 3、Bash、curl、unzip、sha256sum、flock | 安装及防火墙变更在目标主机另行验证 |
| 证书联系邮箱 | `ACME_EMAIL` | 用于 Caddy 自动 HTTPS 证书 |
| 三类凭据 | 独立数据库密码、持久反馈签名密钥、生产管理员密码 | 相互不同；配置文件 0600；单独加密备份 |
| 备份目的地 | 本机专用目录＋异地主机或对象存储 | 约定备份成功／失败告警接收者、保留期限及恢复演练 |
| 发布版本 | 经检查的源码压缩包与 SHA-256，或公开仓库 `jayson2hu/updatehub` 的明确提交 | 可匿名克隆；部署前 fetch 并记录实际 commit SHA；有未提交改动时不能假定远程包含它们，接手方式见 [仓库说明](repository-handoff.md) |
| 小程序 | 后续两端 AppID、合法 HTTPS 域名、精确 Referer 前缀 | 网站可先部署；缺这些条件不宣称原生验收完成 |

## 从当前工作区交付源码

在 `D:\fayun\code\updatehub` 执行：

```powershell
apps/api/.venv/Scripts/python.exe scripts/package-station-release.py
```

脚本先检查常见凭据模式及开发管理员／签名密钥是否误入源码，再打包 Git 跟踪文件及未忽略的新文件，包含尚未提交的实现。输出到忽略的 `runtime/releases/<UTC时间>/`：

- `station-source.zip`：源码，不含 runtime、artifacts、数据库、上传、环境秘密、依赖目录。
- `station-source.zip.sha256`：整包校验。
- 包内 `RELEASE-MANIFEST.json`：逐文件 SHA-256，初始内容策略 `empty`。

包中可能保留示例导入代码、历史设计稿和测试夹具，它们不是生产业务数据；生产启动不会自动执行 seed。源码改动后重新打包和复验，旧压缩包不会自动更新。镜像尚需在目标平台构建和扫描。

## 目标服务器首次部署

以下假定工作目录 `/srv/updatehub`，备份目录 `/srv/updatehub-backups`；Codex 应使用用户确认的实际路径。先检查目录是否已有站点或卷；已有实例进入更新流程，不能当全新安装覆盖。

1. 将源码包和校验文件传到受保护目录，执行 `sha256sum -c station-source.zip.sha256`，检查 ZIP 条目没有绝对路径或 `..` 后解压到新的空目录。核对包内逐文件摘要，保留整包摘要与发布记录。
2. 复制 `.env.production.example` 为根目录 `.env`，执行 `chmod 600 .env`。填写实际 DOMAIN、PUBLIC_SITE_URL、ACME_EMAIL、管理员邮箱和独立密码。数据库密码和签名密钥各自生成 64 位十六进制字符串，可用 Python `secrets.token_hex(32)` 写入配置；不要把值输出到共享日志。第一次管理员密码至少 16 位，避免 `$` 引起 Compose 插值。
3. 清除与 `.env` 冲突的同名 shell 变量，检查配置：

```sh
python3 scripts/deploy-preflight.py --env-file .env --bootstrap --require-docker
docker compose --env-file .env -f docker-compose.prod.yml config --quiet
docker compose --env-file .env -f docker-compose.prod.yml build --pull api web
```

预检查只读，输出字段检查结果，不输出值；它不能代替 DNS、TLS、镜像漏洞和主机安全检查。不要运行不带 `--quiet` 的 Compose 配置导出并分享日志，展开配置含密码。

4. 扫描**实际构建镜像**及 Postgres/Caddy 基础镜像，记录镜像 ID/digest、工具版本、数据库更新时间和未修复条目。可用已安装的 Trivy；`docker compose images -q api` / `web` 得到本次镜像 ID。高危／严重问题逐项修复或形成明确处置，不把扫描失败当无漏洞。本机目前未执行该步骤。
5. 启动并建立管理员，不执行任何 `seed*` 命令：

```sh
docker compose --env-file .env -f docker-compose.prod.yml up -d --wait --wait-timeout 180
docker compose --env-file .env -f docker-compose.prod.yml exec api python -m app.cli create-admin
docker compose --env-file .env -f docker-compose.prod.yml ps
```

API 入口只运行 Alembic 迁移，失败则不启动。创建管理员成功后清空 `.env` 的 `ADMIN_INITIAL_PASSWORD`，重新创建 API，运行正式预检查：

```sh
docker compose --env-file .env -f docker-compose.prod.yml up -d --force-recreate api
python3 scripts/deploy-preflight.py --env-file .env --require-docker
```

重建过程不自动修改数据库中的管理员密码。若曾成功创建账号，不能再次执行 `create-admin` 期待重置密码；命令会拒绝重复账号。

6. 核对业务内容为空，不能在此步骤导入演示资料“填充页面”：

```sh
docker compose --env-file .env -f docker-compose.prod.yml exec -T api python -c 'import json,urllib.request; d=json.load(urllib.request.urlopen("http://127.0.0.1:8000/api/v1/station/data")); assert all(d[k]==[] for k in ("software","releases","announcements","promotions")); assert d["settings"]["ads_enabled"] is False; print("EMPTY_CONTENT_VERIFIED")'
```

7. 检查 DNS、实际 HTTPS 证书、HTTP→HTTPS、首页空状态、后台登录/退出、未登录管理 API 401、生产 `/openapi.json` 不暴露、CSP/安全头，以及外部无法访问 5432/8000/3000。发布／上传的写入验收使用独立验收实例；生产首发空内容检查应先于任何真实录入。
8. 后台设置站名和介绍，备案号按实际状态留空或填写；验证退出后不可读取管理内容。然后按下节建立第一份空站备份和恢复演练。网站可进入运营后，再由管理员新增软件、通知和入口。

## 持久化、备份、更新与回退

| 卷／配置 | 内容 | 注意事项 |
| --- | --- | --- |
| `postgres_data` | 数据库、管理员散列、会话、配置及内容 | 首次为空业务内容；日常更新保留 |
| `uploads` | 真实上传图片 | 与数据库同批次备份，不能只备数据库 |
| `caddy_data` / `caddy_config` | ACME 账号、证书及配置 | 需要持久化，避免每次重建重新申请证书 |
| `.env` 的签名密钥 | 匿名反馈凭据签名 | 密钥不在 DB/上传归档中，需加密单独备份 |

当前是单机、单 API worker：限流在内存中；不能直接扩容多个 worker。API/Web 非 root、只读根文件系统，独立可写上传卷/临时目录；只有 Caddy 对外暴露端口。API 信任转发头的前提是私有网络且 Caddy 覆盖 X-Forwarded-For，不能额外暴露 API。

首次上线后和每次升级前：

```sh
bash infra/scripts/backup.sh docker-compose.prod.yml /srv/updatehub-backups
```

每天定时运行、保留约 14 天、加密异地复制及失败告警。脚本校验成功新备份后才清理旧文件；数据库／图片不是跨存储原子快照，重要变更前暂停后台写入。详细恢复步骤见 [部署与恢复](deployment.md)：只恢复到**新的独立数据库和上传目录**，清理恢复库历史会话，验证后再安排切换。不要直接恢复覆盖在线数据，不要使用 `down --volumes` 更新站点。

更新时先保留旧镜像 ID、源码包、配置安全副本和数据快照，审查迁移兼容性，再构建和重启。代码回退不等于数据库回退；自动降级、删卷及覆盖恢复都不是默认步骤。

## 给下一次 Codex 的部署任务模板

将实际路径与服务器资料补充到任务中，秘密保存在服务器受保护文件或密钥管理器中：

```text
请依据 docs/container-deployment-handoff.md、docs/deployment.md 和 docs/security-review-20261020.md，
将此版本部署到我指定的服务器和域名。服务器访问方式、发布目录及密钥位置见我提供的环境信息。
本次授权按文档执行该站点部署；首次上线使用空内容，只建立表结构、配置和独立生产管理员。
不迁移开发环境数据库、上传或管理员，不执行任何 seed，不删现有卷或覆盖已有站点。
先核对源码包 SHA-256/逐文件清单、当前代码修改和既有服务，再检查配置、构建、扫描实际镜像，
完成 HTTPS/权限/持久卷/空内容验证、备份和独立恢复。发现已有实例按升级流程处理。
不得回显密码、DSN、私钥、Cookie、同步码；不得将凭据写到发布报告。
若条件缺失，完成不依赖该条件的工作，清楚说明缺项；不得用本地测试冒充生产验收。
最后交付地址、镜像和源码摘要、验证证据、备份/告警配置、回退方式及遗留风险。
版本喵仅管理通知与服务入口，不接入第三方听书数据或托管安装包/音频。
```

## 本次交接状态

生产配置模板、只读预检查、源码打包及本地安全回归已提供。修复后浏览器 17 组/29 截图、PostgreSQL 6 组及恢复、双端小程序 7+50 项通过；源码包校验结果在 `artifacts/acceptance-20261019/release-package.json`。服务器、域名、SSH、实际镜像/TLS、定时与异地备份及告警未配置，因此未执行正式上线。安全检测结果与仍需处理的部署风险见 [安全检测报告](security-review-20261020.md)。
