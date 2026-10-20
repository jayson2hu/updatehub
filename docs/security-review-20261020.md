# 版本喵安全检测与修复报告

日期：2026-10-20。对象：当前 `feature/v4` 工作区，包括未提交修改。此次没有提交、推送或公网部署。证据沿用 `artifacts/acceptance-20261019/` 目录，以文件所载运行时间和本报告为准。

## 结论与范围

本轮已检查应用依赖、API 认证与授权、CSRF 与来源、内容和图片校验、生产配置、源码秘密泄漏模式，以及容器/备份脚本的配置。发现的问题已修复，并完成下述本地验证。当前扫描未报告已知依赖漏洞或 Bandit 发现，**不等于系统不存在漏洞，也不代表生产验收通过**。

产品边界已确认：本站只维护软件／服务通知与入口，不接入参考听书项目的专辑、章节、音频、第三方 Cookie 或 token。首次生产上线为空业务内容，不迁移本地数据库、图片和管理员，不执行 seed。已有版本/平台记录仍可维护各自的服务链接。

## 依赖检测

| 检测 | 修复前 | 修复后 | 证据 |
| --- | --- | --- | --- |
| npm audit | 本次扫描未报告漏洞 | 432 个依赖，0 已知漏洞 | `npm-security-audit.json` |
| pip-audit 2.10.1 | 5 个包，58 条公告记录；去重后 30 个公告 ID | 当前应用 venv 未报告已知漏洞 | `python-security-audit-before.json`、`python-security-audit.json`、`python-security-audit.log` |
| Bandit 1.9.4 | 检查 API 应用源码 | 0 findings / 0 errors | `bandit-security.json` |

升级已固定在 `apps/api/requirements.txt`：Pillow 12.3.0、pydantic-settings 2.14.2、pytest 9.0.3、python-multipart 0.0.31。应用 venv 的 pip 升至 26.2，API Dockerfile 也固定先升级 pip 26.2。扫描中的 58 条是带重复的公告记录，不能解释为 58 个独立漏洞。

Python 扫描对象是本机 Windows 应用 venv；Linux 镜像、基础系统包和最终构建中的实际依赖仍需在部署机扫描。漏洞库会变化，发布前重新检查，不能长期沿用“0”的结果。

## 修复与防护检查

| 项目 | 本轮处理及验证 |
| --- | --- |
| 生产来源配置 | PUBLIC_SITE_URL/CORS 只能配置有效 HTTPS origin，拒绝凭据、query/fragment、路径、通配符、反斜线和空白；配置报错隐藏原始输入 |
| 小程序来源 | Referer 前缀必须具体到应用路径并以 `/` 结尾；拒绝整域宽泛前缀、伪造主机和其他 App 路径；来源检查不能替代管理员身份验证 |
| 畸形 Referer | 不合法 IPv6、端口、userinfo、反斜线等返回 403，不因 URL 解析异常变成 500 |
| 管理员权限 | 访客读写管理接口返回 401；有会话但缺 CSRF 或跨站请求返回 403；额外管理字段返回 422。密码 Argon2id、会话散列、退出撤销及生产 Secure Cookie 延续现有实现 |
| 图片 | 在解码起点限定 PNG/JPEG/WebP；检查大小/像素并重编码；伪装 SVG/HTML 和超 5 MiB 上传被拒绝；图片用随机本站路径保存 |
| 请求长度 | 负 Content-Length 返回 400；Caddy 管理请求上限调整为 6 MB，容纳 API 允许的 5 MiB 图片及 multipart 开销，API JSON 限额仍单独生效 |
| API 文档 | 生产关闭 OpenAPI、docs、redoc 路由，子进程验证实际注册结果 |
| 构建与秘密 | Docker 上下文排除嵌套环境文件、`.station-*` 构建、私钥等；生产 env 加入 Git 忽略。预检查拒绝冲突 shell 配置，不导出敏感 Compose 展开配置 |
| 空站初始化 | 隔离新库执行真实 create-admin 后，软件、版本、公告、推广均为空，广告关闭，示例详情 404 |

正文按文本和结构化链接/图片渲染，不接受任意可执行 HTML。新版站点的入口 URL 支持 HTTP/HTTPS，拒绝危险协议、userinfo、非法端口、空白及反斜线。服务器不抓取这些链接，因此不是下载代理；管理员仍需核实目标网站。旧版 URL 校验更严格，旧 API 默认关闭，不能混淆两套边界。

## 实际验证与复跑

- API 全量 **169 passed**，随后安全专项 **28 passed**（包含新加空站初始化测试）；专项中 27 项与全量重叠，不能相加为 197 个独立测试。两条既有测试依赖弃用提示仍存在。证据：`security-api-full.log`、`security-targeted-final.log`。
- 部署预检查 **4 passed**，覆盖域名一致性、密钥独立、初始化密码生命周期、小程序前缀、真实 CLI 环境变量冲突与输出不含测试密钥。证据：`deploy-preflight-tests.log`。
- 两端小程序配置 **7 passed**、构建和逻辑 **50 passed / 0 skipped**，独立临时数据库。证据：`mini-security.log`。不代表原生开发工具或真机通过。
- 源码检查 `source-security.json`：Git 跟踪及未忽略文件，检查常见私钥/AWS/GitHub/Slack 模式和本地管理员密码/签名密钥的精确泄漏；只输出路径和规则。不覆盖 Git 历史，不是任意秘密的完整识别。
- 实际浏览器与 PostgreSQL 的最新结果见本报告附后的复验记录；历史浏览器 `browser-full/report.json` 和 PG 报告仍有各自适用范围。

在项目根目录复跑（工具 venv 需先安装对应扫描工具；生产凭据不应放入命令行）：

```powershell
npm audit --json
runtime/security-tools/Scripts/python.exe -m pip_audit --path apps/api/.venv/Lib/site-packages --progress-spinner off
runtime/security-tools/Scripts/python.exe -m bandit -r apps/api/app
apps/api/.venv/Scripts/python.exe scripts/audit-security-files.py
apps/api/.venv/Scripts/python.exe scripts/test-api.py -q --tb=short
apps/api/.venv/Scripts/python.exe -m unittest discover -s tests -p test_deploy_preflight.py -v
npm run mini:check
apps/api/.venv/Scripts/python.exe scripts/verify-station-browser.py --isolated --channel msedge --output artifacts/acceptance-20261019/browser-security
```

浏览器写入脚本只能指向已准备的隔离 3012 站点。普通权限若受 Windows 进程/临时目录限制，需通过正常执行审批；扫描或测试启动失败不能当作通过。

## 生产前尚需验证及剩余风险

1. **未执行 Docker/OS 镜像扫描、真实 TLS、目标主机和公网动态渗透**。本机无可调用 Docker/Podman。目标机还需核对镜像 digest、证书、HTTPS 跳转、开放端口、代理链、卷权限、空内容、备份和独立恢复。容器配置静态审查不能替代这些步骤。
2. **CSP 尚保留 inline script/style** 供当前框架使用；生产没有 unsafe-eval，但还未完成 nonce 策略。需要配合所有页面回归后收紧。
3. **限流为进程内存**，重启清零，不支持直接扩容多 worker/副本，也不提供分布式攻击防护。当前保持单 API worker；扩容前接共享限流。
4. **数据库权限尚未拆分**：Postgres 初始化用户兼用于迁移和应用。上线加固宜拆迁移账号和最小权限应用账号，先验证迁移、查询及恢复；数据库端口不得对外开放。
5. **运营安全集成未完成**：MFA、集中告警、审计防篡改、异地加密备份及自动失败通知尚待接入。恢复脚本会清除恢复库历史会话，密钥仍须单独安全备份。
6. **测试边界**：未进行外部红队测试、完整 SAST/DAST、Git 历史秘密扫描、真实高并发/拒绝服务测试或全站 WCAG 审计。小程序 AppID/域名缺失，原生编译和真机仍待验。

下一次部署应遵循 [容器部署交接](container-deployment-handoff.md) 与 [部署/备份/恢复](deployment.md)。正式上线时重新扫描，并在发布记录逐项注明完成、未完成和处置；不以本报告代替实际生产证据。

## 修复后的实际服务复验

- 日常 API 8010、隔离 API 8012 已重启，日常 3011/隔离 3012 首页与两个 API `/ready` 均返回 200；保留既有数据库与上传目录，没有向日常库写入验收资料。
- **浏览器 17 组通过、29 张截图、0 页面运行错误**，测试资料清理通过，证据 `browser-security/report.json`。覆盖真实后台创建/失败重试/上传/草稿/发布、公告关联/到期/撤回、多平台/历史版本、分享刷新、复制成功和拒绝兜底、广告失败隔离等。已查看手机首页 390、详情 360 和后台发布 1440 截图，未发现新的遮挡或横向溢出。
- 本轮模拟慢 4G：首页 LCP 976 ms、详情 628 ms、CLS 均 0；仅本地 Edge/Chromium 限速结果。真实宿主与设备边界仍按上节处理。
- **原生 PostgreSQL 17 共 6 组通过**，升级后生产配置、迁移、上传、发布、批量事务回滚、公告及实际 pg_dump/pg_restore 正常。恢复前后 28 张表的行数与内容摘要一致，新进程读取图片、同步和签名凭据通过。证据 `postgres-station.json`、`postgres-security.log`；上一轮报告另存 `postgres-station-before-security.json`。这里的 HTTPS 是 TestClient 地址，仍未验证真实 TLS 或 Docker。
- 部署预检查已修复 Windows 中文 JSON 输出编码，并验证冲突配置不泄露输入值。源码包由打包器先扫描、再生成逐文件摘要并复验 ZIP；运行结果见 `release-package.json`，源码包不包含这些运行证据或本地数据，需在交接时另附脱敏报告。

## 代码入库前补充验证

同日按用户授权准备私有仓库交付时，全量 API 重跑为 **170 passed / 2 条弃用提示**，已包含空站初始化新增测试；Web lint、类型检查及部署配置 4 项再次通过。证据见 `repository-api-tests.log`、`repository-web-lint.log`、`repository-web-typecheck.log`、`repository-preflight-tests.log`。另检查既有 3 次提交/530 个可达文件对象的常见凭据模式及本地秘密精确匹配，0 发现，报告 `repository-history-security.json`；并非完整 Git 历史秘密审计工具的替代。此前 169 与 28 是前次运行记录。
