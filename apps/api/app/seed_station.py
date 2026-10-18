"""Idempotent, clearly fictitious station examples; never overwrites edited records."""
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.station import StationAnnouncement, StationAnnouncementSoftware, StationRelease, StationSettings, StationSoftware


SOFTWARE = [
    ("guangmu", "光幕影视", ["光幕", "GM", "guangmu"], "把喜欢的影视，放进日常片刻。", ["android", "tv", "desktop"], "#497AEE", "normal", ""),
    ("qingning", "青柠放映", ["青柠", "柠檬", "qingning"], "轻巧的手机观影与片单管理工具。", ["android", "ios"], "#629F78", "normal", ""),
    ("yunfan", "云帆电视", ["云帆", "云帆TV", "yunfan"], "为客厅大屏准备的简洁播放体验。", ["tv"], "#6E74D7", "normal", ""),
    ("shiguang", "拾光播放器", ["拾光", "本地播放器", "shiguang"], "在电脑上整理与播放你的本地影片。", ["desktop"], "#D49A52", "normal", ""),
    ("xiaojing", "小鲸影院", ["小鲸", "鲸鱼", "xiaojing"], "随手收藏片单，记录每一次观影。", ["android"], "#409AA9", "unavailable", "当前版本暂时无法使用，恢复后会在本站公告。"),
    ("yinghe", "映盒", ["映盒TV", "盒子", "yinghe"], "适合电视盒子的轻量影视工具。", ["tv"], "#C7757C", "attention", "本次更新需要重新安装，请先查看安装步骤。"),
]


def seed_station(db: Session) -> dict:
    now = datetime.now(timezone(timedelta(hours=8))).replace(microsecond=0)
    count = {"software": 0, "releases": 0, "announcements": 0}
    if db.get(StationSettings, "site") is None:
        db.add(StationSettings(id="site"))
    by_slug = {}
    for slug, name, aliases, summary, platforms, color, status, reason in SOFTWARE:
        item = db.scalar(select(StationSoftware).where(StationSoftware.slug == slug))
        if item is None:
            item = StationSoftware(slug=slug, name=name, aliases=aliases, summary=summary, platforms=platforms, color=color, status=status, status_reason=reason, published=True, is_demo=True,
                installation=["先在页面上选择需要安装的设备，确认设备与版本对应。", "等待管理员配置经过确认的获取入口；本站示例暂不提供安装包。", "正式入口开放后，按设备提示完成安装。电视用户可先在手机中保存链接，再使用 U 盘传到电视。"],
                faqs=[{"question": "为什么现在没有获取按钮？", "answer": "这款软件是用于展示的虚构示例。管理员尚未配置真实获取链接，因此不会显示可下载按钮。"}, {"question": "在群里打开后，外部链接无法跳转怎么办？", "answer": "点「复制链接」，手动打开手机自带浏览器后粘贴访问。复制不可用时，可以长按链接文字选择复制。"}], screenshots=[])
            db.add(item)
            db.flush()
            count["software"] += 1
        by_slug[slug] = item
    examples = [
        ("guangmu", "tv", "2.6.1", 1, "修复部分电视设备启动后黑屏的问题。", "修复特定电视芯片在冷启动时黑屏的问题。\n优化遥控器焦点切换，让常用操作更容易找到。\n保留原有收藏与播放记录。", "normal", ""),
        ("qingning", "android", "1.8.0", 5, "片单可以按最近观看排序了，找剧更方便。", "新增最近观看排序。\n改善弱网环境下封面加载的稳定性。", "normal", ""),
        ("guangmu", "android", "3.2.0", 9, "优化播放稳定性，修复切换清晰度后偶尔卡住的问题。", "修复切换清晰度后偶尔停止响应的问题。\n优化小屏手机上的字幕间距。\n本次更新可直接覆盖安装，收藏记录会保留。", "normal", ""),
        ("yunfan", "tv", "4.0.2", 25, "遥控器更好用了，返回键也能回到上次浏览的位置。", "调整返回键逻辑，减少重复查找。\n修复少数电视盒子的画面比例异常。", "normal", ""),
        ("shiguang", "desktop", "2.1.0", 29, "新增本地字幕匹配，长文件名也能完整显示。", "优化电脑端窗口缩放。\n修复部分字幕编码导致的乱码。", "normal", ""),
        ("yinghe", "tv", "1.5.0", 48, "本次更新需要重新安装，请先查看安装步骤。", "升级配置存储方式。\n旧版本配置不兼容，请先记录收藏内容，再卸载旧版本。", "attention", "安装前请记录收藏内容并卸载旧版，避免安装失败。"),
        ("xiaojing", "android", "1.3.2", 52, "当前版本暂时无法使用，恢复后会在本站公告。", "已确认当前版本出现连接问题，正在排查。\n请勿重复安装，也不要向陌生人购买所谓修复包。", "unavailable", "服务维护中，暂时无法使用。请等待后续公告。"),
        ("qingning", "ios", "1.4.0", 73, "改善苹果手机上的字幕显示与横屏体验。", "调整横屏安全区域。\n优化字幕字体大小与对比度。", "normal", ""),
        ("guangmu", "desktop", "1.9.0", 95, "电脑端新增播放速度记忆。", "下次打开影片时保留上次选择的播放速度。", "normal", ""),
        ("guangmu", "tv", "2.6.0", 145, "优化电视端首页加载速度。", "减少首次打开时的等待。\n优化遥控器导航。", "normal", ""),
        ("guangmu", "android", "3.1.0", 170, "修复收藏列表偶尔重复的问题。", "改善收藏记录合并逻辑。", "normal", ""),
    ]
    for slug, platform, version, hours, summary, notes, status, reason in examples:
        software = by_slug[slug]
        if not software.is_demo:
            continue
        existing = db.scalar(select(StationRelease.id).where(StationRelease.software_id == software.id, StationRelease.platform == platform, StationRelease.version == version))
        if existing:
            continue
        published_at = now - timedelta(hours=hours)
        db.add(StationRelease(software_id=software.id, platform=platform, version=version, summary=summary, notes=notes, status=status, status_reason=reason, install_notice=reason if slug == "yinghe" else "示例内容：暂未配置获取链接，请勿到不明网站寻找安装包。", published=True, published_at=published_at, created_at=published_at, links=[]))
        count["releases"] += 1
    notices = [
        {"slug": "welcome-guide", "title": "新群友先看这里：更新、安装，一站找到", "summary": "收藏这个小站，以后找新版不用再翻群消息。记得先选择自己的设备。", "body": "欢迎来到更新小站。软件更新、使用说明和群公告都会集中在这里。\n\n先打开「软件」，找到自己正在使用的软件；再选择安卓、苹果、电视或电脑，查看对应版本和安装方法。\n\n本站当前内容均为虚构示例，暂不提供真实安装包。正式使用前，请由管理员填写经过确认的获取链接。\n\n如果在小红书内打开外部入口没有反应，请复制链接，手动到系统浏览器粘贴打开。", "category": "group", "importance": "important", "pinned": True, "expires_at": now + timedelta(days=30), "hours": 4, "slugs": []},
        {"slug": "xiaojing-maintenance", "title": "小鲸影院维护中，暂时不用重复安装", "summary": "当前版本连接异常，恢复后会在这里通知。请保留现有配置。", "body": "当前版本暂时无法使用，我们正在排查连接问题。\n\n请先保留收藏与原有配置，不需要反复卸载或安装。\n\n恢复后会在本站和群内同步发布通知。以上为维护状态的示例内容。", "category": "maintenance", "importance": "urgent", "pinned": False, "expires_at": now + timedelta(days=7), "hours": 8, "slugs": ["xiaojing"]},
        {"slug": "yinghe-reinstall", "title": "映盒 1.5.0 安装前，请先记录收藏内容", "summary": "新版需要重新安装，按说明操作可以减少安装失败。", "body": "本次升级调整了配置保存方式。\n\n1. 在旧版本中记录或截图保存收藏内容。\n2. 卸载旧版本。\n3. 获取对应电视版后重新安装。\n\n此处为安装提醒示例，尚未配置实际安装包。", "category": "usage", "importance": "important", "pinned": False, "expires_at": None, "hours": 47, "slugs": ["yinghe"]},
        {"slug": "past-maintenance", "title": "上周例行维护已结束", "summary": "示例维护已经结束，日常使用无需额外操作。", "body": "例行维护现已结束。\n\n这条公告保留供群友查阅，到期后不再置顶展示。\n\n以上为已结束公告的示例内容。", "category": "maintenance", "importance": "normal", "pinned": True, "expires_at": now - timedelta(days=2), "hours": 180, "slugs": ["guangmu"]},
    ]
    for values in notices:
        if db.scalar(select(StationAnnouncement.id).where(StationAnnouncement.slug == values["slug"])):
            continue
        published_at = now - timedelta(hours=values.pop("hours"))
        slugs = values.pop("slugs")
        item = StationAnnouncement(**values, published=True, published_at=published_at, created_at=published_at, is_demo=True, images=[], links=[])
        item.associations = [StationAnnouncementSoftware(software_id=by_slug[slug].id) for slug in slugs if by_slug[slug].is_demo]
        db.add(item)
        count["announcements"] += 1
    db.commit()
    return count
