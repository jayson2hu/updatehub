# 当前服务器预览部署

部署日期：2026-10-20。源码目录：`/root/project/pre/updatehub`。部署基于提交 `6df297ad3081f67a10a8ddfb32f94333fd8eba52` 及本文记录的预览编排、镜像源构建参数和浏览器验收脚本修正。

## 访问和账号

- 公开站点：<http://117.72.170.254>
- 管理入口：`/admin`，仅管理员需要登录。
- 独立管理员的邮箱和密码保存在服务器 `runtime/preview-admin.json`，权限 `0600`。该文件和 `.env` 被 Git 忽略，凭据不写入仓库或验收报告。
- 首次站点保持空内容，软件、版本、公告和推广均为 0，广告总开关关闭。没有向访问站执行任何 seed。

这是 IP + HTTP 预览，API 使用 `ENVIRONMENT=preview`，没有配置生产域名或 TLS。公开页面已通过公网 IP 检查；管理员凭据只经本机 `127.0.0.1` 验收，没有通过公网 HTTP 发送。正式上线应按 `container-deployment-handoff.md` 配置实际域名、HTTPS 和生产环境。

## 运行方式

编排文件为 `compose.preview.yaml`，项目名 `updatehub-preview`。FastAPI 和 Next.js 独立运行，数据库为 `station_data` 卷内的 SQLite 文件 `/data/station.db`（2026-10-28 起，与生产一致；此前的 `postgres_data`/`uploads` 卷不会自动迁移，切换时需重新初始化或单独导入）。Web 映射到空闲的 80 端口，API 没有宿主机端口映射；两个容器均配置 `restart: unless-stopped`。API/Web 使用非 root 用户和只读根文件系统。

根目录 `.env` 权限为 `0600`，保存本次随机生成的数据库密码、持久签名密钥和访问配置。管理员创建完成后，初始化密码已从 `.env` 和运行容器环境清除。

在源码目录执行：

```sh
# 查看状态 / 有限日志 / 启动已构建版本
docker compose --env-file .env -f compose.preview.yaml ps
docker compose --env-file .env -f compose.preview.yaml logs --tail 100 api web
docker compose --env-file .env -f compose.preview.yaml up -d --wait

# 需要重新构建时
docker compose --env-file .env -f compose.preview.yaml build api web

# 停止，保留数据
docker compose --env-file .env -f compose.preview.yaml stop

# 手动备份
bash infra/scripts/backup.sh compose.preview.yaml /root/project/pre/updatehub/runtime/backups
```

仅使用 `config --quiet` 检查配置，避免输出含秘密的展开配置。保留数据时不要删卷。正式更新前先备份；旧镜像不能自动撤销数据库迁移。

本次为解决服务器依赖下载缓慢，两个 Dockerfile 增加可选镜像源构建参数，默认源保持官方地址；预览编排指定可达镜像源，依赖版本沿用仓库要求和 npm 锁文件。

## 本次实际验收证据

证据目录为 `artifacts/deployment-20261020/`，这些是本次服务器运行结果，不是 README 的历史记录。

| 验收范围 | 结果与证据 |
| --- | --- |
| 前后端镜像构建 | 通过；前端编译及 TypeScript 检查通过，实际镜像摘要见 `containers.json` |
| API 全量回归 | 170 passed，1 条 Starlette 测试依赖弃用提示；`api-tests.log` |
| 部署预检查回归 | 4 passed；`deploy-preflight-tests.log` |
| 访问站浏览器 | 9 组检查通过；360/390/768/1440 前台页面、空状态、管理页面、回环地址登录/退出和 CSRF；`preview-browser/report.json`，7 张截图 |
| 业务浏览器流程 | 分阶段完成 17 组覆盖：创建/上传/失败重试/草稿/发布、多设备和历史版本、公告生命周期、广告、反馈、复制和收藏同步；详情见下方运行边界 |
| 慢网 | 仅本机 Chrome 模拟慢 4G：首页 LCP 1112 ms，详情 592 ms，CLS 均 0；`remaining-browser/report.json`；不代表真实公网设备性能 |
| 真实 HTTP 与重启 | 创建/权限/公告等 8 项、重启前凭据准备 1 项通过；实际重建 API 容器后，数据、图片、同步码、签名及防重放 5 项通过；`artifacts/acceptance-20261019/http-*.json` 为本次执行结果，目录名沿用原脚本 |
| 备份和独立恢复 | 实际 `pg_dump`、上传归档、校验和检查及新数据库恢复通过；28 张表、管理员、迁移版本、空内容和恢复后应用就绪检查通过；`backup-restore.json` |

原始整组浏览器运行曾在广告图片断言失败：图片已可见，但尚未完成下载；已增加对 `img.complete` 的等待并复验广告展示、关闭、失败隔离和到期。复跑确认前 15 组通过后，运行进程收到 SIGTERM，未生成完整成功报告。最后两组使用仓库同一检查函数及全新隔离记录单独补跑通过，证据在 `remaining-browser/report.json`。因此不宣称整组单次执行成功；`isolated-browser/attempts/` 保留早期失败记录。

旧 `/privacy` 页有返回旧帮助入口的后台预取长请求；正文和布局正常，本次访问站验收按页面加载及可见内容检查就绪，不把所有预取结束作为就绪条件。当前前台实际隐私入口为 `/about#privacy`。

业务写入验收始终使用独立的 `updatehub-acceptance` 项目和数据库，没有写入访问站。验收完成后停止该临时项目，保留其数据供复查。临时恢复数据库验证后已删除，原访问站数据库保持不变。小程序原生工具、真机、真实 TLS、镜像漏洞扫描、定时与异地备份不属于本次已完成的 IP 预览验收。

## 备份位置

首份备份位于服务器 `runtime/backups/`，文件权限 `0600`：

- `updatehub-db-20261020T122747Z.dump`
- `updatehub-uploads-20261020T122747Z.tar.gz`
- `updatehub-checksums-20261020T122747Z.sha256`

脚本每次成功备份后才执行 14 天保留清理；本次没有安装定时任务或异地复制。签名密钥仍需随受保护的 `.env` 单独安全保存。
