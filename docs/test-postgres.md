# PostgreSQL 验证与恢复演练

本机验证使用 Windows x64、Python 3.14、PostgreSQL 17.10，独立监听 `127.0.0.1:55439`。不复用业务库、不安装系统服务、不创建操作系统账号；不使用其他工作区的 55432/55433。最新实际结果见 [`full-product-test-report.md`](full-product-test-report.md)，历史报告中的断言数量只代表当时版本。

## Windows 便携启动器

先按 README 安装 Python 虚拟环境和 API 依赖，并准备 Node.js 24，在仓库根目录执行：

```powershell
npm install --prefix runtime/pg embedded-postgres@17.10.0-beta.17 --no-audit --no-fund
$env:UPDATEHUB_PG_TEST_PORT = "55439"
node tests/portable-postgres.mjs
node tests/portable-postgres.mjs --content
```

无参数执行目录、公告及版本历史回归；`--content` 执行指南、FAQ、合集、Finder、运营聚合与数据保留验证。每次运行初始化全新目录与测试库、生成随机密码，结束后停止其自身数据库进程。密码仅通过环境/短暂初始化文件传递，输出会脱敏；初始化文件随后删除。

默认端口为 55439。端口冲突时指定另一个空闲端口，不停止已有服务、不复用现有数据库。隔离目录位于已忽略的 `runtime/pg/data-*`，保留用于失败排查；不提交到仓库。

## 原生备份恢复演练

此检查需要 PostgreSQL 17 的 `pg_dump` 和 `pg_restore`。便携服务器 npm 包没有附带这两个客户端工具，可从 PostgreSQL 官方下载页指向的 EDB Windows 二进制包获得，放在独立目录并设置 `UPDATEHUB_PG_CLIENT_BIN`；DLL 版本必须匹配。本机实际使用 EDB `postgresql-17.10-1-windows-x64-binaries.zip` 内的工具，位于已忽略的 `runtime/pg-client/bin`。

```powershell
$env:UPDATEHUB_PG_CLIENT_BIN = "D:/tools/postgresql17/bin"
$env:UPDATEHUB_PG_TEST_PORT = "55439"
node tests/portable-postgres.mjs --restore
```

省略客户端目录变量时先检查 `runtime/pg-client/bin`，再查 PATH。启动器同时把其便携 PostgreSQL bin 加入子进程 PATH，以供同版本 DLL 加载。`--restore` 与 `--content` 不能合用。

`tests/postgres_restore.py` 创建演示目录/公告/内容、管理员、上传图标和登录会话，生成 custom dump 与图标归档及 SHA-256 值，恢复到随机命名的独立新库，逐表比较行数和数据摘要，撤销恢复会话，再从独立进程验证 `/ready`、目录、软件详情、公告、指南、FAQ、合集、图标、登录和审计。还会确认源库未变化、图标字节一致。JSON 输出到 `artifacts/postgres-restore-result.json`，不输出凭据。

这是原生数据库/文件恢复证据，不表示 Linux Docker 包装脚本、容器权限、定时备份或生产切换已验证。真实容器脚本检查位于 `tests/container_restore.sh`，由 CI 的独立临时项目执行。

## 已有隔离 PostgreSQL

直接脚本接受 `DATABASE_URL=postgresql+psycopg://.../updatehub_test_任意标识`。必须使用新建、空白、专用测试库；迁移检查会执行降级，绝不能指向业务库。脚本在任何迁移或写入前检查数据库名称及现有表/视图，非空库直接拒绝。恢复演练额外要求本机地址。

```sh
python tests/postgres_smoke.py
python apps/api/tests/postgres_content_smoke.py
python tests/postgres_restore.py
```

上述三次执行各需单独的新空库；不要把同一个已运行过的测试库传给下一脚本。运行失败后新建测试库重试，不手动删除业务数据来满足前置条件。
