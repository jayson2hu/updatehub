# 共享接口契约

所有 API 前缀 `/api/v1`，前端统一 `lib/api.ts`。成功响应为直接 JSON，不加 data wrapper。

Category: `{ id: string, name: string, slug: string, sort_order: number }`。

OfficialLink: `{ id: string, label: string, url: string, type: 'website'|'download'|'release'|'docs'|'store', platform: string|null, architecture: string|null, is_primary: boolean, is_active: boolean, last_checked_at: string|null }`。

Software: `{ id, name, slug, short_name, summary, description, icon_url, category_id, category: Category|null, website_url, docs_url, github_url, latest_version, current_release_id: string|null, update_level: 'critical'|'recommended'|'optional'|'hold', update_reason, published, is_demo, aliases: string[], tags: string[], purposes: string[], platforms: string[], official_links: OfficialLink[], seo_title, seo_description, created_at, updated_at }`。`current_release_id` 是只读的持久版本来源，不代表对应公告目前公开。可选文本统一空字符串或 null，前端防御两者。

`GET /software?q=&category=&platform=&page=1&page_size=12` -> `{ items: Software[], total: number, page: number, page_size: number }`；GET `/search` 同形状。`GET /software/{slug}` -> Software；`GET /categories` -> Category[]。

`GET /settings` -> `{ site_name: string, site_description: string }`（环境配置）。`GET /health`, `/ready`（根路径亦提供）。

`POST /admin/auth/login` body `{email,password}` -> `{user:{id,email},csrf_token:string}` 并设置 HttpOnly session。`GET /admin/auth/me` 同返回；`POST /admin/auth/logout` -> `{ok:true}`。修改操作带 `X-CSRF-Token`；前端 API client 自动从 me/login 缓存 CSRF。

`GET /admin/software` 分页同公开列表（含未发布）；`GET /admin/software/{id}` 返回 Software。`POST /admin/software` 及 `PATCH /admin/software/{id}` 接收 Software 的可写字段（排除 id/category/current_release_id/created_at/updated_at）；官方链接嵌套整体替换，可带原 id。`DELETE /admin/software/{id}` 软下线返回 `{ok:true}`。

`POST /admin/categories`, `PATCH /admin/categories/{id}`, `DELETE /admin/categories/{id}` 管理分类，已被引用的分类删除返回 409。

`POST /admin/uploads/icon` multipart `file` -> `{url:string}`，仅解码验证 PNG/JPEG/WebP，最大 2 MB。`GET /admin/audit` -> `{items: Audit[],total,page,page_size}`；Audit 包含 id/admin_user_id/action/resource_type/resource_id/payload/created_at。

`GET /go/{link_id}`（根路径）及 `/api/v1/go/{link_id}` 只允许已发布软件的 active 数据库链接，302。

错误 `{detail: string | PydanticValidationError[]}`；401 未登录、403 CSRF、404 不存在、409 冲突、422 校验、429 限流。所有 API 明确 Pydantic schema。

## 公告接口

ReleaseUpdate: `{id,slug,title,summary,content,kind,software_id,software,version,previous_version,update_level,changes,reason_to_update,who_should_update,who_can_wait,known_issues,notes,official_release_url,official_release_date,status,is_pinned,is_demo,is_historical,published_at,created_at,updated_at}`。`kind` 为 `release|notice|maintenance`；`status` 为 `draft|review|published|archived`；`is_historical:boolean` 默认为 false，历史补录使用 true；software 及 software_id 可空，官方来源及日期可空；changes 为 string[]；时间统一带 UTC 时区。

- `GET /updates?q=&kind=&software_id=&software_ids=&update_level=&include_historical=false&page=1&page_size=12` → 标准分页。默认排除历史补录，主动传 `include_historical=true` 才包含。software_ids 是最多 500 个逗号分隔 ID，用于浏览器本地关注筛选，默认同样排除历史。q 匹配公告标题、摘要、正文及关联软件名称 / 别名。
- `GET /updates/{slug}` → ReleaseUpdate。
- `GET /software/{slug}/updates?include_historical=false` → 该软件的公开公告分页，默认排除历史补录。
- `GET /software/{slug}/history?page=1&page_size=12` → `{items: ReleaseUpdate[], total, page, page_size}`。仅该公开软件的已发布 `release`，不含提醒、维护、草稿、待审核或归档。按 `official_release_date` 倒序，缺失时用首次 `published_at` 的 UTC 日期；同日期按首次发布时间、ID 倒序，与版本权威排序一致。置顶不改变历史顺序，补录旧版本按实际官方日期插入，不比较版本字符串。`page` 为 1–10000，`page_size` 为 1–100；不存在 / 未公开软件返回 404，无历史时返回空分页。历史首条不一定代表档案当前版本，因为归档不回退已记录的软件版本事实。
- `GET /software/{slug}/current-release` → `ReleaseUpdate|null`。仅返回持久 `current_release_id` 指向、归属该软件、已公开、非历史补录且版本号、演示属性、建议等级及建议原因全部与软件事实一致的记录。无明确来源、来源归档或任一事实已由管理员独立修改时返回 200/null，不猜测其他公告，也不修改指针或软件事实；软件不存在或未公开返回 404。
- `GET /admin/software/{id}/history?page=1&page_size=12&status=` → 标准版本分页，需管理员登录；包含该软件所有状态的 release（包括历史补录及未公开软件资料），可用 draft/review/published/archived 筛选。按版本日期、首次发布时间、ID 倒序；软件不存在返回 404。
- `GET /admin/updates` → 含所有状态的标准分页，增加 status 筛选；`GET /admin/updates/{id}` → 公告详情。
- `POST /admin/updates` → 创建草稿或待审核，201；`PATCH /admin/updates/{id}` → 修改可写字段。不能通过这两个接口直接进入发布或归档状态。
- `POST /admin/updates/{id}/publish`，body 必须 `{confirmed:true}` → 发布后的完整公告。
- `POST /admin/updates/{id}/archive` → 归档后的完整公告。
- `GET /admin/updates/{id}/notification?format=plain|markdown` → `{text:string}`，仅对当前公开公告生成；历史补录在开头明确写出“历史版本记录 · 非当前更新建议”。

发布必须有标题、摘要、正文、影响范围和行动建议；版本公告还需公开的软件、新版本和有效官方来源。历史补录必须为 release，并在发布时填写实际官方发布日期；草稿可暂不填日期。历史补录永不写软件当前版本、建议、演示属性或 current_release_id，并从当前版本依据候选中排除。普通版本发布与软件版本 / 建议 / 指针 / 审计同步处于一个事务。演示公告不能覆盖真实软件事实。

首次发布后锁定 kind、software_id、official_release_date、is_demo 和 is_historical；公开 / 归档后的修改保留原状态，客户端应省略 status。重新发布保留首次发布时间；归档保留当前版本事实和来源指针，但不会公开归档内容。普通版本仍按官方发布日期（未填写时使用首次发布的 UTC 日期）再按首次发布时间决定版本依据，不以版本字符串推测先后；历史补录必须显式使用 is_historical=true，避免同日或不明日期记录误写当前版本。

已发布公告的普通 PATCH 只在其仍持有当前指针，且修改前版本、演示属性和建议均与软件事实一致时同步软件资料。管理员独立维护的事实不会被纯文案编辑覆盖；如需重新确认来源，应使用独立人工发布操作。迁移仅回填唯一匹配既有版本及建议、并且符合原版本顺序的来源；存在歧义或手工事实偏差时指针保留 null。

公开查询只显示 published，且关联软件必须已公开。草稿 / 归档 / 已下线软件的公告按 404 处理。除读取外的管理操作仍需 session 与 X-CSRF-Token。完整机器可读 schema 见 `docs/api/openapi.json`。
