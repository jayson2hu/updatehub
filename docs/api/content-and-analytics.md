# 内容、找软件与运营 API

基址 `/api/v1`。准确字段、约束和响应见 [OpenAPI](openapi.json)。指南、FAQ、清单使用数据库中的同一内容模型；现有公告、历史版本和当前版本来源规则不变。

## 内容模型

`ContentDocument` 具有以下字段：

| 字段 | 含义 |
| --- | --- |
| `id`, `kind`, `slug`, `title` | 类型为 `guide`、`faq` 或 `collection`；创建后类型不可变，slug 全局唯一 |
| `summary`, `content` | 摘要和纯文本正文；FAQ 的 title 是问题、content 是答案 |
| `sections` | 指南步骤 `[{title, body}]`，最多 30 项；草稿可保存空标题或空说明 |
| `software_id`, `software` | 指南或 FAQ 可关联一款软件，允许 null |
| `category_id`, `category` | 可关联目录分类，允许 null |
| `platforms`, `purposes` | 平台数组、中文用途数组；均按完整值筛选 |
| `status`, `sort_order`, `is_demo` | `draft/published/archived`、列表顺序、演示标识 |
| `published_at`, `created_at`, `updated_at` | 明确带 `Z` 的 UTC 时间；首次发布时间在重新发布时保留 |
| `items` | 清单软件成员，最多 100 项，按顺序返回 |

清单成员写入格式：

```json
{
  "id": "已有成员才需要提供，可省略",
  "software_id": "软件 ID",
  "sort_order": 0,
  "importance": "recommended",
  "note": "选择这款软件的理由"
}
```

`importance` 支持 `required/recommended/optional`。返回成员另含完整 `software`。重复软件或成员 ID、跨清单的成员 ID、将成员 ID 转移给其他软件都会被拒绝。提交列表按 `sort_order` 稳定排序，同值保持提交顺序，再规范为 `0..n-1`。PATCH 省略 items 保留列表；传空数组清空；传列表替换整个列表，成员可省略具有默认值的字段。

## 公开读取

| 请求 | 响应 |
| --- | --- |
| `GET /guides`、`GET /faq`、`GET /collections` | `{items,total,page,page_size}` |
| `GET /guides/{slug}`、`GET /faq/{slug}`、`GET /collections/{slug}` | 一份内容，不存在或不可见返回 404 |

列表支持 `q`（最多160字符）、`software_id`、`category`（分类 ID 或 slug）、`platform`、`purpose`（最多80字符）、`page`、`page_size`（1–100）。各条件使用 AND 组合。用途/平台可匹配内容自身元数据、关联软件或清单中可见的软件；它们不要求出自同一个清单成员，前端可按设备进一步选择成员。公共列表的 total 在可见性过滤之后计算。

搜索匹配标题、摘要、正文、指南步骤的实际标题/正文，以及关联软件或清单成员的名称、简称、别名。JSON 的字段名不会被当作正文。查询中的 `%`、`_` 按字面搜索。

公共可见性：只返回 published；关联软件下线后，该指南或 FAQ 隐藏。清单成员软件下线后，公共响应移除该成员，不能通过其 ID、名称、别名、平台或用途匹配；全部成员下线时整个清单隐藏。后台仍保留完整记录。

正文均为普通文本，客户端不应把它们交给原始 HTML 渲染器。

## 后台管理

所有读取要求管理员会话；所有写入要求同一会话、CSRF token 和可信 Origin，继承现有 `/admin` 安全约束。响应禁止缓存。

| 请求 | 行为 |
| --- | --- |
| `GET /admin/content` | 分页筛选，额外支持 kind/status，可查看所有状态 |
| `GET /admin/content/{id}` | 后台详情 |
| `POST /admin/content` | 新建草稿，201 |
| `PATCH /admin/content/{id}` | 仅修改草稿；未传字段保持原值 |
| `POST /admin/content/{id}/publish` | `{ "confirmed": true }`，人工确认后公开 |
| `POST /admin/content/{id}/unpublish` | 变为草稿，立即撤下公开内容 |
| `POST /admin/content/{id}/archive` 或 `DELETE /admin/content/{id}` | 软归档，保留成员及审计 |

普通保存的 status 只能为 draft。已发布或已归档内容直接 PATCH 返回 409，需先下线为草稿；这样公开内容只通过明确发布步骤更新。可再次发布完整的归档内容，也可先恢复为草稿编辑。

发布前校验：指南有摘要，且正文或步骤至少一项，每个已添加步骤完整；FAQ 有答案；清单有摘要和至少一个成员，所有成员都已发布；任何单软件关联也必须已发布。关联演示软件时必须标记为演示内容。清单只能通过 items 关联软件；FAQ 和清单不使用 steps，实际字段名为 sections。

保存、发布、下线、归档均与审计日志原子提交。使用中的分类无法删除，包括被草稿或归档内容引用的分类。

## 描述式找软件

`GET /finder?q=帮我找个录屏工具&platform=windows` 返回 SoftwarePage，支持与软件列表一致的分类和分页参数。除了原有搜索，还在描述中匹配已公开目录中的名称、别名、标签、用途。中文等非 ASCII 词至少2字符，拉丁词至少3字符并检查词边界；不会把 Git 匹配到 digital。

匹配完全来自已维护的数据，不调用外部 AI，也不会创造未收录的软件。原 `/software` 和 `/search` 搜索语义保持不变。

## 统计与隐私

搜索页实际可见后提交一次：

```http
POST /api/v1/analytics/events
Content-Type: application/json
```

```json
{"event":"search","query":"找个截图工具","result_count":0,"scope":"software"}
```

返回 204。scope 支持 `software/updates/guides/faq/collections`；result_count 范围 0–1000000。接口只接受这一白名单事件与字段、验证来源，并复用有界内存限流。公开事件不要求管理员会话或 CSRF token。GET 搜索、SSR、页面预取均不记录搜索，前端应避免重复提交同一次可见搜索。

已验证的 `/go/{link_id}` 302 请求记录官方点击；错误链接、停用入口、不公开的软件以及带非法查询参数的跳转不计数。带 `Purpose` 或 `Sec-Purpose: prefetch` 的预取不计数。统计故障不会阻止已经验证通过的官方跳转。

仅在 `analytics_daily` 按 UTC 日期、事件、scope、关键词或官方链接 ID 聚合次数与无结果次数。没有事件明细、IP、会话 ID、访客 ID、浏览器指纹、来源页面或外部遥测。产品/官方链接 ID 仅标识公开目录数据。IP 仅由既有内存限流短暂使用，不写入统计表。

搜索词经 NFKC、大小写和空格规范化，最多保留80字符。邮箱、URL、IP、长数字串、凭据格式、控制字符等归为「已隐藏的搜索词」，原词不保存；普通未收录短语仍保留以帮助运营补充软件与别名。这是格式过滤，不能保证任意自然语言完全没有个人信息，用户界面应明确说明会保存经过过滤的搜索关键词，避免要求用户输入个人资料。

保留最近90个 UTC 日的数据。每次写入、服务启动和运行中的每日 UTC 午夜都会清理过期日；服务关闭时不运行任务，重新启动后先执行清理。管理员还可手工清理：

```text
python -m app.cli purge-analytics         # 仅过期日
python -m app.cli purge-analytics --all   # 清空全部聚合统计
```

指标代表事件次数，不是去重人数；无需也没有匿名访客标识。result_count 由客户端提交，所以这些统计用于运营参考，不用于计费或审计用户行为。

## 运营工作台

`GET /admin/dashboard?days=30` 支持1–90日，返回：

- `totals`：软件/公告/内容总量、已发布量及待处理量。
- `analytics`：搜索、无结果、官方点击总次数；补零的 daily 序列；top_searches、top_no_result_searches（均最多20条）；top_software、top_links。
- `pending_content`、`pending_updates`：最近修改的10条待处理记录。
- `gaps`：最多50款已公开软件的 `official_link/version/guide/faq` 缺口。
- `recent_actions`：最近10条真实审计记录。

所有数量均来自数据库；归档及草稿在后台可管理，但不会冒充公开内容。软件的指南/FAQ 缺口指软件专属、已公开的对应内容；通用教程不会自动填平全部软件的内容缺口。

## 迁移与示例内容

新增迁移 `7b50d52a94fc`，继承 `3c0114d69cdc`。SQLite 与 PostgreSQL 使用相同模型：content_document、content_item、analytics_daily 三张表，不改写既有公告、软件版本或当前来源指针。

```text
python -m alembic upgrade head
python -m app.cli seed-content
```

seed-content 是显式开发维护命令；不会在启动或普通 seed 中自动发布内容。它添加4篇指南、规范中的10条FAQ、开发/办公/设计/学习/综合使用5份有序清单。所有内容带演示标识。需关联软件的示例只使用已有、公开的演示软件，缺失条件时跳过。遇到已有 slug 始终保留原记录，不覆盖管理员编辑，不恢复被下线内容；重复执行新增数为0。

自动验证：`apps/api/tests/test_content.py`、`test_analytics.py`、`test_readiness.py`；真实 PostgreSQL 验收可用 `node tests/portable-postgres.mjs --content`，该脚本拒绝非测试名称或非空数据库，覆盖并发聚合与完整迁移往返。
