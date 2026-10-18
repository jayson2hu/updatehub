# 部署、备份与恢复

本轮提供单机 Docker Compose 配置。2026-09-26 已在隔离的原生 PostgreSQL 17.10 执行数据库与图标恢复演练，结果见 `full-product-test-report.md`。当前开发机器没有 Docker CLI，未执行容器镜像、生产启动或证书签发；原生演练不替代 Docker 脚本与卷权限验收。以下步骤需由部署主机实际执行，不是已上线声明。

## 生产准备与启动

要求 Linux、Docker Engine、Compose v2、可解析到服务器的域名，以及可供 Caddy 访问的 80/443 TCP 与可选 443 UDP。数据库和图标写入持久化卷；镜像和代码不能代替数据备份。

1. 将 `.env.example` 复制为仓库根目录 `.env`，限制该文件读取权限。
2. 生成唯一的 `POSTGRES_PASSWORD`：`python3 -c "import secrets; print(secrets.token_hex(32))"`，不复用其他站点的密码。使用十六进制避免 URL 转义问题。会话使用随机 token，不依赖共享签名密钥。
3. 设置 `DOMAIN=你的域名`、`ACME_EMAIL=运维邮箱`、`PUBLIC_SITE_URL=https://你的域名`，以及站名、介绍和初始管理员邮箱与密码。`DOMAIN` 只填主机名，不含路径。
4. 在根目录执行：

```sh
docker compose -f docker-compose.prod.yml config --quiet
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml exec api python -m app.cli create-admin
```

生产是否导入演示内容由管理员决定；需要样例时显式执行 `docker compose -f docker-compose.prod.yml exec api python -m app.cli seed`，再执行同样前缀的 `python -m app.cli seed-content` 导入指南、FAQ 与合集。演示内容上线前应逐条核对、改写或下线。

创建管理员后清除 `.env` 中 `ADMIN_INITIAL_PASSWORD`，并重新创建 API 容器，使初始密码不再保留于容器环境：

```sh
docker compose -f docker-compose.prod.yml up -d --force-recreate api
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 100 api web caddy
```

核对域名 HTTPS、首页数据、登录退出、新建与下线测试软件、图标上传、外部官方链接来源、手机布局，以及 API 容器内的 `/ready`。生产 API 文档是否公开由应用环境配置决定，不应依赖其作为健康检查。

生产配置是独立文件，只传 `-f docker-compose.prod.yml`；不要同时叠加开发配置。两个配置使用不同项目名和数据卷。生产不暴露 PostgreSQL、API 或 Web 端口。

## 更新与回退

更新代码前先做数据库和图标备份，保留当前代码版本及 `.env` 的安全副本。检查新版本迁移，再重建服务。API 启动会先迁移数据库，仅适合当前单实例部署。

```sh
bash infra/scripts/backup.sh docker-compose.prod.yml /srv/updatehub-backups
docker compose -f docker-compose.prod.yml up -d --build
```

应用代码回退不等于数据库回退。若迁移不兼容旧代码，需在隔离数据库恢复并验证后制定切换步骤；不要直接向在线库导入历史备份。`docker compose down` 保留卷，`down --volumes` 会删除数据，日常更新不要使用后者。

## 每日备份

在仓库根目录运行以下命令。脚本使用 `pg_dump --format=custom`，同时归档图标卷，生成 SHA-256 校验文件。只有成功生成新备份后才清理指定备份目录中超过 14 天的同格式历史文件。

```sh
bash infra/scripts/backup.sh docker-compose.prod.yml /srv/updatehub-backups
```

脚本需要 Bash、Docker Compose、`realpath`、`sha256sum` 和 `flock`。建议通过 `crontab -e` 手动配置每日 03:10 运行，按实际仓库路径调整：

```cron
10 3 * * * cd /srv/updatehub && /bin/bash infra/scripts/backup.sh docker-compose.prod.yml /srv/updatehub-backups >> /var/log/updatehub-backup.log 2>&1
```

默认保留约 14 天，时点恢复能力约为一天；没有 WAL 连续归档。数据库与图标先后备份，不是跨存储原子快照。重要变更前暂停后台写入，执行备份并确认两份文件完整。数据量增长时再评估专用备份方案。

数据库备份包含管理员密码散列、会话与审计信息。备份目录仅运维账号可读，将副本加密保存到不同主机；异地复制、告警与密钥管理尚未自动化。定时任务失败必须由外部运维监控发现，本仓库没有假定已接入告警系统。

## 恢复演练

先在备份目录校验文件：

```sh
cd /srv/updatehub-backups
sha256sum -c updatehub-checksums-实际时间戳.sha256
cd /srv/updatehub
bash infra/scripts/restore.sh docker-compose.prod.yml /srv/updatehub-backups/updatehub-db-实际时间戳.dump updatehub_restore_20260926
```

恢复脚本在创建数据库前自动核对 dump 与同目录、同时间戳 SHA-256 清单，只接受 `backup.sh` 的文件命名。校验通过后仅创建全新数据库；目标已存在、目标为在线库或 PostgreSQL 系统库时拒绝执行。恢复成功后会删除恢复库的历史管理员会话。脚本不删除旧库、不自动切换连接串；失败时保留隔离目标供检查，修正后使用另一个新名字重试。

图标需恢复到独立目录或独立卷，不直接覆盖在线卷。对于本脚本产生、已校验且可信的归档，可在运维主机使用 Python 3.12+ 安全提取：

```sh
mkdir /srv/updatehub-restore-icons-20260926
python3 -c "import tarfile; a=tarfile.open('/srv/updatehub-backups/updatehub-uploads-实际时间戳.tar.gz'); a.extractall('/srv/updatehub-restore-icons-20260926', filter='data')"
```

启动独立测试 API，明确将 `DATABASE_URL` 指向恢复库、`UPLOAD_DIR` 指向恢复目录，并使用独立端口。验证迁移版本、软件数量、分类关联、公开详情、图标、管理员登录和审计读取；确认恢复库中没有继续有效的历史会话后再计划正式切换。正式切换前停止写入、创建最后备份、确认目标卷权限、修改连接串与图标挂载并重启，然后再次验收。

记录每次演练的备份时间、文件校验、恢复耗时、数据核对与结果。仅生成备份文件不算通过恢复验证。

## 健康、日志与运行监控

`/health` 表明应用进程可以响应；`/ready` 检查数据库连通性，并要求 `alembic_version` 与镜像中的全部迁移 head 完全一致，版本过旧、缺失或为空会返回 503。Compose 通过 `/ready` 决定 API 健康状态；Web 会检查首页是否响应成功。

API 请求日志记录方法、路径、状态与处理毫秒数，不记录查询串、Cookie 或密码。部署主机应采集容器退出/重启、5xx 比例与延迟、数据库连接与磁盘空间、主机 CPU/内存、备份最近成功时间，并配置超阈值通知。当前仓库没有已连接的外部监控、异地备份或告警账号，不能将这些运维动作写成已完成。

运营工作台的搜索与点击统计不是系统健康监控。定期清理过期运营汇总可运行 `docker compose -f docker-compose.prod.yml exec -T api python -m app.cli purge-analytics`；保留策略以当前隐私说明和 API 配置为准。

## 持续集成与上线核对

CI 的容器任务只启动独立项目 `updatehub-ci` 的 PostgreSQL、API 与 Web，不为示例域名申请 TLS。`tests/container_restore.sh` 验证生产镜像健康、可写图标卷、备份清单、独立恢复库、拒绝在线库/已有库、清空恢复会话和恢复后的 API 读取；此脚本明确拒绝普通本地/生产运行。CI 结束只清理该临时项目。

正式上线还必须记录实际流水线结果、域名 HTTPS、真实内容审校、管理员登录/退出、备份定时任务与告警、异地副本以及一次部署主机恢复演练。没有部署凭据时不自动发布，也不使用本机截图替代生产证据。
