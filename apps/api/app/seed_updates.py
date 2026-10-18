from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ReleaseUpdate, Software
from app.models.entities import utcnow
from app.schemas.catalog import utc_datetime
from app.schemas.updates import UpdateWrite
from app.services.updates import UpdateService


EXAMPLES = [
    dict(slug="demo-announcement-reading", title="先读结论，再决定下一步：公告阅读说明", kind="notice", software=None, is_pinned=True, update_level="optional", summary="这个演示站点展示公告、影响范围和行动建议的组织方式。", content="此条为演示公告，并非软件厂商的最新通知。阅读时先确认是否涉及自己使用的软件，再查看行动建议、注意事项和官方来源。本站不托管安装包。", who_should_update="第一次使用公告中心的成员。", reason_to_update="先认识公告中的演示标识；真实决策前核对官方来源，不要转发演示内容作为真实通知。"),
    dict(slug="demo-vscode-release", title="VS Code 版本公告示例：先核对扩展，再安排升级", kind="release", software="vscode", is_pinned=True, update_level="recommended", version="DEMO 1.2", previous_version="DEMO 1.1", days=1, summary="演示一条包含版本变化、影响范围和升级步骤的公告；版本号与建议均为示例。", content="这是流程演示，不对应真实发布事件，也不表示已验证 VS Code 当前版本。真实发布时，管理员应在这里解释官方变更与群成员的工作流程有什么关系。", changes=["示例变化：在这里概括经人工核验的主要变更。", "示例说明：将官方技术描述转成成员能够执行的步骤。"], who_should_update="演示场景：需要评估代码编辑环境的开发成员。", who_can_wait="演示场景：正在交付项目、暂不打算调整编辑环境的成员。", reason_to_update="演示建议：备份设置，确认扩展兼容性，再在非关键项目中验证。请以真实官方发布说明为准。", official_release_url="https://code.visualstudio.com/updates"),
    dict(slug="demo-docker-compatibility", title="Docker 使用提醒示例：环境变更前保留回退方案", kind="notice", software="docker", update_level="hold", summary="演示“建议暂缓”类公告的表达方式，不代表 Docker 存在已确认的兼容问题。", content="这条演示提醒说明如何记录适用范围和验证步骤。它不是已核实的产品故障或厂商通知，也没有要求成员停止使用现有 Docker 环境。", who_should_update="演示场景：准备调整本地容器环境的成员。", reason_to_update="先阅读项目的环境要求，记录现有配置，并在测试环境验证计划中的变更。", known_issues="尚未针对真实版本核验；此处仅为已知问题字段的演示。"),
    dict(slug="demo-obs-release", title="OBS 版本公告示例：先做一次短录制测试", kind="release", software="obs", update_level="optional", version="DEMO 2.0", previous_version="DEMO 1.9", days=2, summary="演示按需升级公告：说明谁需要关注，以及正式录制前如何确认环境。", content="此公告为演示，不对应 OBS 的真实版本发布。版本变化、发布日期与建议仅用于展示公告工作流。", changes=["示例变化：管理员可在此填入已核验的录制或音频相关变更。"], who_should_update="演示场景：准备录制课程、演示视频或直播的成员。", who_can_wait="现有环境符合需求且暂不调整配置的成员，可先阅读实际官方说明。", reason_to_update="演示建议：保存场景配置，进行短录制，检查画面和声音后再投入正式使用。", official_release_url="https://github.com/obsproject/obs-studio/releases"),
    dict(slug="demo-maintenance-window", title="维护通知示例：安排、影响范围与后续说明", kind="maintenance", software=None, update_level="optional", summary="展示如何发布站点维护安排；这里没有真实维护计划，也没有服务中断通知。", content="此条为维护公告模板演示。真实维护时，应在正文说明开始与结束时间、受影响入口、可用的替代方式，以及恢复后如何确认。当前这条内容不代表已安排维护。", who_should_update="演示场景：维护期间需要访问公告中心的成员。", reason_to_update="本示例无需执行操作。真实通知请确认具体时间、受影响功能和管理员后续说明。", notes="演示内容，请勿转发为实际维护通知。"),
    dict(slug="demo-python-release", title="Python 环境公告示例：先确认项目支持的版本", kind="release", software="python", update_level="recommended", version="DEMO 3.0", previous_version="DEMO 2.9", days=3, summary="演示语言环境更新公告，重点说明项目依赖与验证步骤。", content="这是示例公告，不是 Python 的真实版本信息。实际升级应先核对项目的版本约束、依赖和官方文档，不应仅依据本站演示版本号。", changes=["示例变化：在这里列出影响当前项目的变化。"], who_should_update="演示场景：维护 Python 项目或学习环境的成员。", who_can_wait="项目依赖尚未验证的成员。", reason_to_update="演示建议：在独立虚拟环境运行项目检查，验证通过后再调整日常环境。", official_release_url="https://www.python.org/downloads/"),
    dict(slug="demo-notion-sharing", title="Notion 使用提醒示例：共享前确认访问范围", kind="notice", software="notion", update_level="optional", summary="演示一条没有版本号的使用提醒，帮助成员找到应采取的具体行动。", content="本条演示如何发布操作提醒，不代表 Notion 修改了权限规则。共享工作空间资料之前，通常应先确认链接访问范围、成员权限和资料敏感性。", who_should_update="演示场景：向其他成员分享笔记或团队资料的用户。", reason_to_update="检查资料共享对象与权限；如不确定团队规则，先向工作空间管理员确认。"),
    dict(slug="demo-official-source", title="重要提醒示例：软件操作前核对官方来源", kind="notice", software="chrome", update_level="critical", summary="演示重要程度较高的提醒；这不是 Chrome 安全漏洞或紧急升级通报。", content="这条演示公告用于展示重要提醒样式，不宣称发现了任何真实漏洞或攻击。实际软件操作应基于已核验的官方公告与可信来源。", who_should_update="演示场景：收到来源不明安装或升级链接的成员。", reason_to_update="不要依据演示内容安装或升级软件；先确认官方域名及真实公告，再决定后续操作。"),
    dict(slug="demo-vscode-release-1-1", title="VS Code 历史版本示例：DEMO 1.1 扩展验证", kind="release", software="vscode", history_before="demo-vscode-release", update_level="optional", version="DEMO 1.1", previous_version="DEMO 1.0", official_release_date="2026-09-20", summary="演示历史版本记录：从扩展验证到实际工作流程检查。版本、日期与变化均为示例。", content="这是持久保存的历史公告演示，不对应 VS Code 的真实发布事件。它用于说明如何回看某个版本的变化、适用范围和当时的行动建议。请勿根据演示版本号决定安装或升级。", changes=["演示项：记录准备验证的扩展清单。", "演示项：补充常用项目的检查步骤。"], who_should_update="演示场景：需要回顾编辑器环境变更的开发成员。", who_can_wait="只查看当前公告、无需回顾演示历史的成员。", reason_to_update="此历史示例不要求升级；如需调整真实环境，请查看当前官方说明并核对项目要求。", official_release_url="https://code.visualstudio.com/updates"),
    dict(slug="demo-vscode-release-1-0", title="VS Code 历史版本示例：DEMO 1.0 设置基线", kind="release", software="vscode", history_before="demo-vscode-release", update_level="optional", version="DEMO 1.0", previous_version="DEMO 0.9", official_release_date="2026-09-18", summary="演示较早版本如何记录设置基线、变更原因和后续检查。", content="这是历史线的演示资料，不是已核验的厂商版本信息。示例时间仅用于展示版本顺序，不表示 VS Code 曾在此日期发布该版本。", changes=["演示项：保存变更前的设置基线。", "演示项：说明与前一演示版本的差异。"], who_should_update="演示场景：复核团队开发环境配置的成员。", reason_to_update="无需执行本演示中的版本操作；真实环境变更前应保存现有设置，并遵循团队确认的操作步骤。", official_release_url="https://code.visualstudio.com/updates"),
    dict(slug="demo-vscode-release-0-9", title="VS Code 历史版本示例：DEMO 0.9 初始评估", kind="release", software="vscode", history_before="demo-vscode-release", update_level="hold", version="DEMO 0.9", previous_version="DEMO 0.8", official_release_date="2026-09-15", summary="演示初期评估记录：把验证范围与暂缓理由保留在历史中。", content="此条用于演示如何追溯较早的公告与判断依据。版本、日期及建议都是示例，不代表 VS Code 的真实故障、兼容问题或升级结论。", changes=["演示项：建立环境验证清单。", "演示项：记录尚待确认的步骤。"], who_should_update="演示场景：查看早期验证过程的维护成员。", reason_to_update="此处“暂缓”仅演示历史建议样式，不是当前操作要求。请根据真实官方公告和当前项目情况决定行动。", known_issues="未对应任何真实版本核验；这里展示的是历史备注字段。", official_release_url="https://code.visualstudio.com/updates"),
]


def seed_updates(db: Session) -> int:
    count = 0
    for example in EXAMPLES:
        if db.scalar(select(ReleaseUpdate.id).where(ReleaseUpdate.slug == example["slug"])):
            continue
        data = dict(example)
        software_slug = data.pop("software")
        history_before = data.pop("history_before", None)
        if software_slug:
            software = db.scalar(select(Software).where(Software.slug == software_slug))
            # Never overwrite an administrator's non-demo or unpublished catalog.
            if software is None or not software.is_demo or not software.published:
                continue
            data["software_id"] = software.id
        days = data.pop("days", None)
        if days is not None:
            data["official_release_date"] = utcnow().date() - timedelta(days=days)
        data["is_demo"] = True
        data["is_historical"] = bool(history_before)
        payload = UpdateWrite(**data)
        if history_before:
            anchor = db.scalar(select(ReleaseUpdate).where(ReleaseUpdate.slug == history_before, ReleaseUpdate.software_id == payload.software_id))
            # Only backfill strictly older demo records below an existing published
            # anchor. Administrator drafts and current software facts are preserved.
            if anchor is None or anchor.published_at is None or not anchor.is_demo:
                continue
            anchor_day = anchor.official_release_date or utc_datetime(anchor.published_at).date()
            if payload.official_release_date is None or payload.official_release_date >= anchor_day:
                continue
        service = UpdateService(db)
        item = service.save(payload, admin_id=None)
        service.publish(item.id, admin_id=None)
        count += 1
    return count
