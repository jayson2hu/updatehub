"""Explicit, idempotent seed; never overwrites content edited by an administrator."""
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ContentDocument, Software
from app.schemas.content import ContentWrite
from app.services.content import ContentService


GUIDES = [
    dict(slug="getting-started", title="第一次使用：建立适合自己的软件清单", summary="从操作系统和日常任务开始，找到软件、确认官方入口，再按需关注公告。", content="先选你当前设备的系统，再选开发、办公、设计或学习等用途。清单是一组可调整的建议，不需要一次安装全部软件，也不会检测你的电脑。", purposes=["综合使用"], sections=[
        {"title": "确认设备与用途", "body": "Windows 可在设置中的系统信息查看系统类型；macOS 可在“关于本机”查看芯片。选择你确实要完成的任务，先从最少的软件开始。"},
        {"title": "阅读每款软件的说明", "body": "检查支持的平台、用途和清单中的选择理由。浏览器与同类工具通常可二选一；演示版本号不代表厂商当前发布版本。"},
        {"title": "只通过官方入口获取", "body": "进入软件详情后选择官方网站或官方下载页面。在厂商页面重新核对系统、芯片架构和许可条件，本站不托管安装包。"},
        {"title": "关注并复查公告", "body": "把实际使用的软件加入“我的软件”。关注信息保存在当前浏览器，清除浏览器数据后可能丢失；可通过导出保留自己的清单。公告先看影响范围和行动建议，再决定是否更新。"},
    ]),
    dict(slug="vscode-first-project", title="VS Code 入门：从打开项目到验证环境", software="vscode", summary="编辑器安装好以后，还需要确认项目目录、运行环境和扩展的职责。", content="VS Code 是代码编辑器。Python、Node.js 等语言运行环境需要按项目要求另外准备；不要把编辑器版本与项目运行环境版本混为一谈。", purposes=["开发编程", "学习"], sections=[
        {"title": "先读项目说明", "body": "查看项目的 README 和环境要求，确认支持的系统、语言版本与启动方式。不要直接在重要项目里试装大量扩展。"},
        {"title": "打开自己的项目文件夹", "body": "通过“打开文件夹”选择项目目录。遇到工作区信任提示时，先确认代码来源；不了解的项目可保持受限模式。"},
        {"title": "只添加必要扩展", "body": "在编辑器的官方扩展市场查看发布者、说明和权限，再安装当前语言需要的扩展。先验证一个小项目，再逐步增加工具。"},
        {"title": "运行并记录环境", "body": "按项目文档运行一次示例或测试，记下有效的语言版本和操作步骤。以后更新编辑器或运行环境时，用同一项目复查。"},
    ]),
    dict(slug="before-software-update", title="更新之前：五分钟检查与回退准备", summary="用一套简单步骤判断公告是否影响自己，降低临近交付时的环境变更风险。", content="“有新版本”只说明出现了变化，不代表所有人都应该马上更新。真实操作应结合官方发布说明、你的项目要求及管理员建议；本文没有声明任何厂商的当前版本或漏洞状态。", purposes=["综合使用", "普通办公"], sections=[
        {"title": "确认当前版本与影响范围", "body": "在软件的帮助或关于页面查看实际版本，核对公告涉及的平台、版本和使用场景。历史版本记录用于回顾，不能自动当作当前建议。"},
        {"title": "保存可以恢复的资料", "body": "按软件官方说明导出设置或备份重要文件，确认备份可以读取。涉及团队设备、插件、驱动或服务时，先遵循组织的维护安排。"},
        {"title": "阅读兼容性与已知问题", "body": "检查常用扩展、文件格式和项目依赖的兼容说明。若公告建议暂缓，应先解决相应条件，不要只按版本数字做决定。"},
        {"title": "小范围验证后再迁移", "body": "通过官方入口更新，在非关键任务中验证启动、文件读写和常用功能。遇到问题保留错误提示与版本信息，按照厂商支持文档处理。"},
    ]),
    dict(slug="obs-first-recording", title="OBS 第一次录屏：先录一段，再开始正式任务", software="obs", summary="检查画面、声音、权限和存储位置，避免录完才发现缺少关键内容。", content="录屏的画面来源与音频来源需要分别确认。不同系统的权限入口和捕获方式可能不同，请以当前系统和 OBS 官方说明为准。", purposes=["设计创作", "学习"], sections=[
        {"title": "建立最小场景", "body": "新建一个场景，只添加当前需要的屏幕或窗口来源。检查预览是否包含不应公开的通知、账号信息或其他窗口。"},
        {"title": "检查麦克风与系统声音", "body": "选择正确的输入设备，观察音量表，并确认系统允许录音和屏幕捕获。耳机、蓝牙设备或外接麦克风切换后应重新检查。"},
        {"title": "设置文件位置并短录制", "body": "选择有足够空间的保存目录，录制二十秒包含说话和画面操作的测试。停止后实际播放文件，检查声音、文字清晰度和画面范围。"},
        {"title": "正式录制后再次确认", "body": "避免在重要录制前临时调整编码器或插件。录完后确认文件可播放，再移动或清理其他素材；涉及他人画面与声音时先取得必要同意。"},
    ]),
]

FAQS = [
    ("official-download", "我应该在哪里下载软件？", "打开本站的软件详情，选择“官方网站”或“前往官方下载页面”。跳转后确认厂商域名、系统和芯片架构，再按官方说明获取。本站的官方入口由管理员维护；不要把搜索广告或相似名称网站当作官网。"),
    ("no-installers", "本站会不会提供安装包？", "不会。本站提供更新公告、软件说明与已登记的官方入口，不托管安装包，也不会要求安装专用下载器。最终下载发生在软件官方网站、官方发布页或官方应用商店。"),
    ("windows-architecture", "Windows x64 和 ARM 怎么选择？", "在 Windows 设置的“系统 → 系统信息（关于）”查看系统类型和处理器。x64 设备通常选择 x64；ARM 设备优先检查厂商是否提供 ARM64。只有厂商明确支持时才考虑兼容运行方式，不要仅按电脑品牌判断。"),
    ("macos-architecture", "macOS Intel 和 Apple Silicon 怎么选择？", "打开苹果菜单中的“关于本机”。显示 Apple 芯片型号的设备通常选择 Apple Silicon 或 ARM64；显示 Intel 处理器的设备选择 Intel。若官网提供 Universal 版本，请阅读其支持范围。还要核对最低 macOS 版本。"),
    ("version-difference", "为什么官网版本和这里不一样？", "本站资料与公告由管理员人工核验后发布，可能晚于厂商，也可能展示不同发布通道、平台或历史版本。带“演示”标识的版本并非真实厂商版本。获取安装程序时以官方页面为准，发现差异可把软件名和官方页面提供给管理员复核。"),
    ("wait-before-update", "为什么有更新但不建议升级？", "新版本可能需要验证扩展、项目依赖、系统要求或团队工作流程。公告的“暂缓”或“按需”建议会说明适用范围；先确认是否涉及自己，再查看官方发布说明。历史公告中的建议不自动代表今天的建议。"),
    ("check-current-version", "怎么确认自己当前的软件版本？", "通常可在软件的“帮助 → 关于”或设置页面查看。有些命令行工具可按官方文档使用版本查询命令。浏览器、商店客户端和便携版可能来自不同通道，反馈时同时说明系统和安装来源。本站不会读取你设备上的已安装软件。"),
    ("official-site-unavailable", "软件官网打不开怎么办？", "先确认网络连接和页面地址，可稍后重试或查看厂商的官方状态页。组织网络的访问限制应由网络管理员处理。不要因此改用来源不明的镜像或所谓高速下载器；如果本站入口已失效，请把软件名和报错现象交给管理员核验。"),
    ("missing-software", "我的软件为什么没有显示？", "先尝试英文名、常见缩写或用途，例如“写代码”“录屏”。仍找不到时可能尚未收录、名称别名不完整，或资料正在核验。搜索无结果不等于软件不存在；可把准确名称和官方网站提供给管理员补充。"),
    ("settings-after-update", "更新以后需要重新配置吗？", "这取决于软件和版本变化。多数原地更新可能保留设置，但不能把它当作保证。先阅读官方迁移说明，按要求备份设置、插件配置和项目文件；重大版本、跨平台迁移或组织管理的设备尤其需要提前验证。"),
]

COLLECTIONS = [
    ("developer-starter", "开发编程基础清单", "从编辑器、版本管理和项目运行环境开始，按实际项目增减工具。", "开发编程", [
        ("vscode", "required", "编辑项目文件；它与语言运行环境是不同的工具。"), ("git", "recommended", "记录修改并与团队协作；先了解项目的分支和提交规范。"), ("nodejs", "optional", "JavaScript 或 Web 项目需要时再安装，采用项目支持的版本。"), ("python", "optional", "Python 项目或学习任务需要时使用，并建立独立虚拟环境。"), ("docker", "optional", "项目明确使用容器时再加入，先检查系统要求与许可条件。"),
    ]),
    ("office-starter", "普通办公基础清单", "覆盖网页办公、资料整理和文件处理，避免为相同任务重复安装工具。", "普通办公", [
        ("chrome", "recommended", "用于网页办公；若已有符合组织要求的浏览器，可继续使用。"), ("notion", "optional", "整理笔记和项目资料，共享前确认访问权限。"), ("7zip", "optional", "需要处理压缩包时使用，按官网选择系统对应的发行形式。"), ("vlc", "optional", "需要本地播放常见音视频文件时加入。"),
    ]),
    ("design-starter", "设计创作基础清单", "从界面设计到演示录制，按任务选择工具并验证交付格式。", "设计创作", [
        ("figma", "recommended", "制作界面与原型，先确认团队空间和文件权限。"), ("obs", "optional", "录制演示或课程，正式任务前做短录制测试。"), ("firefox", "optional", "检查网页或交付链接；可与现有浏览器按需搭配。"),
    ]),
    ("learning-starter", "学习与资料整理清单", "先明确学习任务，再选择笔记、编程或影音工具。", "学习", [
        ("notion", "recommended", "整理课程笔记与学习计划，避免把敏感资料误设为公开。"), ("vscode", "optional", "学习编程时编辑项目文件。"), ("python", "optional", "课程要求 Python 时安装，并遵循课程版本范围。"), ("vlc", "optional", "播放本地课程视频和音频。"),
    ]),
    ("everyday-starter", "综合使用基础清单", "以浏览、文件处理和影音播放为起点，每个工具都可以按需求取舍。", "综合使用", [
        ("chrome", "recommended", "日常浏览网页；也可以继续使用你已熟悉的浏览器。"), ("7zip", "optional", "需要压缩或解压文件时加入。"), ("vlc", "optional", "需要本地影音播放时加入。"), ("notion", "optional", "需要跨任务整理资料时加入。"),
    ]),
]


def seed_content(db: Session) -> int:
    eligible = {item.slug: item for item in db.scalars(select(Software).where(Software.is_demo.is_(True), Software.published.is_(True)))}
    examples = []
    for source in GUIDES:
        data = dict(source)
        software_slug = data.pop("software", None)
        if software_slug and software_slug not in eligible:
            continue
        if software_slug:
            data["software_id"] = eligible[software_slug].id
            data["category_id"] = eligible[software_slug].category_id
            data["platforms"] = eligible[software_slug].platforms
        examples.append(dict(kind="guide", **data))
    for position, (slug, question, answer) in enumerate(FAQS):
        examples.append(dict(kind="faq", slug=slug, title=question, content=answer, sort_order=position))
    for position, (slug, title, summary, purpose, members) in enumerate(COLLECTIONS):
        if any(software_slug not in eligible for software_slug, _, _ in members):
            continue
        examples.append(dict(kind="collection", slug=slug, title=title, summary=summary, purposes=[purpose], sort_order=position, items=[dict(software_id=eligible[software_slug].id, sort_order=index, importance=importance, note=note) for index, (software_slug, importance, note) in enumerate(members)]))
    count = 0
    for source in examples:
        if db.scalar(select(ContentDocument.id).where(ContentDocument.slug == source["slug"])):
            continue
        service = ContentService(db)
        item = service.save(ContentWrite(**source, is_demo=True), admin_id=None)
        service.transition(item.id, admin_id=None, status="published")
        count += 1
    return count
