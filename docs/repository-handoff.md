# 代码仓库与接手说明

更新：2026-10-20。

## 仓库与分支

- GitHub 公开仓库：[jayson2hu/updatehub](https://github.com/jayson2hu/updatehub)。2026-10-20 按所有者要求改为公开，已禁用凭据助手验证匿名读取远程分支成功；克隆无需 GitHub 登录，写入仍需授权。
- 默认分支 `main`；现有开发分支 `feature/v4` 保留。首次交付将两条远程分支推送到同一个已检查的提交，不改写既有提交历史。
- 网站、FastAPI 后台、数据库迁移、共用小程序源码和微信/小红书产物在同一个仓库。小程序改 `apps/miniprogram` 后运行 `npm run mini:build`，两端生成目录一同提交。
- 不包含开发数据库、上传图片、管理员明文凭据、签名密钥、原生工程私人配置和本地验收截图。首次生产上线为空内容，不能从本地运行目录补齐数据。
- 本轮安全与产品验收证据路径记录在文档中；`artifacts/` 是本地忽略目录，克隆后不会出现。要查看原始证据需另行移交脱敏文件，或在隔离环境重跑；CI 运行状态从 [Actions](https://github.com/jayson2hu/updatehub/actions) 查看，不以已存在工作流文件作为通过证明。

## 新机器接手

```sh
git clone https://github.com/jayson2hu/updatehub.git
cd updatehub
git switch main
git status --short
git log -1 --oneline
```

公开仓库克隆和拉取无需配置凭据。推送凭据由本机凭据管理器或受限 deploy key 管理，不能把 token 放进克隆地址或项目环境示例。

本地开发参考 [启动与运营](station-operations.md)，安装 Node.js 22+（CI 使用 24）、Python 3.13+，安装 npm/Python 依赖后迁移和创建自己的管理员。Windows 可执行 `./scripts/station-init.ps1 -SkipDemo -CreateAdmin` 创建空站；仅需要演示数据的独立开发环境才省略 `-SkipDemo`。本地持久目录在 `runtime/`，新机器需要自己初始化。

Linux 生产部署参考 [容器交接手册](container-deployment-handoff.md) 与 [.env.production.example](../.env.production.example)。复制配置后填写真实值，不提交 `.env`。初始化只运行数据库迁移和 `create-admin`，严禁执行 seed 或复制开发账号/数据库。以后接独立服务，只在现有软件／版本中维护通知和访问入口。

## 日常提交与验证

新开发先从当前远程分支创建工作分支，确认没有本机密钥或运行内容混入 diff，再提交并推送；合并前审查 Actions 结果。已有远程改动时先 fetch 并审查，不强推覆盖。

```sh
npm ci
npm run lint
npm run typecheck
```

类型检查要求已生成 Next.js 路由类型；全新机器可先在 `apps/web` 执行 `npx next typegen`。完整构建使用 `npm run build`，`API_INTERNAL_URL` 必须指向本次环境的 API；浏览器写验收只对专用 3012/8012 隔离环境运行。

后端、小程序、PostgreSQL、浏览器和配置检查的安装前提及命令见 [统一验收说明](v4/05-测试与验收.md) 与 [安全报告](security-review-20261020.md)。CI 的一次性测试密码只属于临时测试库，不能用于正式账号。

## 交付边界与待配置项

- 本地 Web/API、持久化、多设备/历史版本入口及通知发布已验收；详见测试报告，扫描结果只代表对应代码和运行时间。
- 生产尚需服务器、域名、HTTPS、独立生产管理员、数据库/签名密钥、镜像安全检查、持久卷、备份/恢复及告警配置；本次代码推送不会自动部署到用户服务器。
- 微信和小红书原生发布尚缺真实 AppID 与合法 HTTPS 域名，开发工具编译和真机仍待验收。AppSecret 不得进入小程序或仓库。
- 备案号按实际状态配置；未取得时留空。广告默认关闭，后续可使用已预留的独立模块和位置。

仓库已公开，尚未声明开源许可证；如需正式开源授权，后续由所有者选择许可证。

## 首次推送前检查记录

2026-10-20 已重新执行：API 全量 **170 passed**（2 条测试依赖弃用提示）、Web lint 和类型检查通过、部署预检查 **4 passed**、文档链接检查通过。证据在本地 `artifacts/acceptance-20261019/repository-api-tests.log`、`repository-web-lint.log`、`repository-web-typecheck.log` 和 `repository-preflight-tests.log`。

首次推送前，对既有 3 次提交的 530 个可达文件对象及当前源码检查常见秘密模式，并匹配本地管理员密码/签名密钥，未发现命中。记录 `repository-history-security.json`；该结果不代表任意秘密的完整识别，也不覆盖不可达对象。暂存清单另行检查，排除运行数据和私人配置。

最新远程提交 SHA 与 Actions 状态应在交接时实际读取，不将尚未结束或尚未运行的工作流写成通过。
