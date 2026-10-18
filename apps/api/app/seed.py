from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, Software
from app.schemas.catalog import SoftwareWrite
from app.services.catalog import CatalogService

CATEGORIES = [
    ("developer-tools", "开发编程"), ("browsers", "网络浏览"),
    ("productivity", "办公效率"), ("design", "设计创作"),
    ("utilities", "系统工具"), ("media", "影音录制"),
]

# Product descriptions and official destinations are curated metadata. Versions
# are explicitly DEMO; seeding never claims to have checked current releases.
SOFTWARE = [
    dict(slug="vscode", name="Visual Studio Code", short_name="VS Code", summary="轻量的代码编辑器，编写、调试和管理你的项目。", description="适合开发者和正在学习编程的人。支持扩展、集成终端和 Git。它是代码编辑器；开发不同语言时，仍需按项目要求配置对应运行环境。", aliases=["VSCode", "VS Code", "微软代码编辑器", "蓝色代码编辑器", "写代码"], tags=["代码编辑器", "开发工具"], purposes=["写代码", "学习编程"], category="developer-tools", platforms=["windows", "macos", "linux"], website_url="https://code.visualstudio.com/", docs_url="https://code.visualstudio.com/docs", github_url="https://github.com/microsoft/vscode", download="https://code.visualstudio.com/download"),
    dict(slug="chrome", name="Google Chrome", short_name="Chrome", summary="浏览网页、同步书签，使用熟悉的浏览器扩展。", description="适合日常上网、办公和网页开发。通过 Google 官方页面获取适合系统的安装程序；组织管理的设备请遵循管理员的软件策略。", aliases=["谷歌浏览器", "Chrome浏览器", "上网"], tags=["浏览器", "网页"], purposes=["浏览网页", "在线办公"], category="browsers", platforms=["windows", "macos", "linux", "android", "ios"], website_url="https://www.google.com/chrome/", download="https://www.google.com/chrome/"),
    dict(slug="git", name="Git", short_name="Git", summary="跟踪代码修改，与团队协作管理项目版本。", description="适合需要版本管理的开发者和内容维护者。Git 是版本控制工具；GitHub 等代码托管平台是不同的服务。首次使用时建议配置自己的提交姓名和邮箱。", aliases=["版本控制", "版本管理工具", "代码版本"], tags=["版本管理", "命令行"], purposes=["管理代码", "团队协作"], category="developer-tools", platforms=["windows", "macos", "linux"], website_url="https://git-scm.com/", docs_url="https://git-scm.com/doc", github_url="https://github.com/git/git", download="https://git-scm.com/downloads"),
    dict(slug="docker", name="Docker", short_name="Docker", summary="使用容器运行应用，让开发环境更容易复现。", description="适合需要运行容器、搭建开发服务的用户。Docker Desktop 的系统要求和许可条件会随使用场景不同；安装前请查看官方说明。", aliases=["容器", "小鲸鱼", "Docker Desktop"], tags=["容器", "开发环境"], purposes=["运行容器", "搭建开发环境"], category="developer-tools", platforms=["windows", "macos", "linux"], website_url="https://www.docker.com/", docs_url="https://docs.docker.com/", download="https://www.docker.com/products/docker-desktop/"),
    dict(slug="notion", name="Notion", short_name="Notion", summary="把笔记、文档和项目资料整理到一个工作空间。", description="适合个人笔记和团队知识整理。可通过网页或官方客户端使用。保存涉及团队或个人隐私的资料前，应先了解工作空间共享权限。", aliases=["笔记", "笔记软件", "知识库"], tags=["笔记", "文档", "协作"], purposes=["记笔记", "整理资料", "团队协作"], category="productivity", platforms=["windows", "macos", "android", "ios", "web"], website_url="https://www.notion.com/", docs_url="https://www.notion.com/help", download="https://www.notion.com/desktop"),
    dict(slug="figma", name="Figma", short_name="Figma", summary="一起设计界面、制作原型，并交付设计规格。", description="适合界面设计师、产品团队和前端开发者。支持浏览器协作和桌面客户端。打开团队文件时，请确认组织账号及文件访问权限。", aliases=["UI设计", "界面设计", "原型工具", "做 UI"], tags=["设计", "原型", "协作"], purposes=["设计界面", "做 UI", "制作原型"], category="design", platforms=["windows", "macos", "web"], website_url="https://www.figma.com/", docs_url="https://help.figma.com/", download="https://www.figma.com/downloads/"),
    dict(slug="firefox", name="Mozilla Firefox", short_name="Firefox", summary="开源浏览器，提供扩展和隐私保护设置。", description="适合日常浏览以及需要测试不同浏览器的开发者。可从 Mozilla 官方页面选择系统版本，扩展应通过浏览器的官方扩展目录安装。", aliases=["火狐", "火狐浏览器", "Firefox浏览器"], tags=["浏览器", "开源"], purposes=["浏览网页", "测试网页"], category="browsers", platforms=["windows", "macos", "linux", "android", "ios"], website_url="https://www.mozilla.org/firefox/", docs_url="https://support.mozilla.org/products/firefox", download="https://www.mozilla.org/firefox/new/"),
    dict(slug="7zip", name="7-Zip", short_name="7-Zip", summary="解压和压缩常见文件格式，整理大文件更方便。", description="适合需要解压 ZIP、7z 等归档文件的用户。安装时根据设备架构选择对应程序。解压不明来源文件前，应确认文件来源和内容。", aliases=["7zip", "解压软件", "压缩软件", "压缩文件"], tags=["压缩", "文件管理"], purposes=["压缩文件", "解压文件"], category="utilities", platforms=["windows", "linux", "macos"], website_url="https://www.7-zip.org/", download="https://www.7-zip.org/download.html"),
    dict(slug="obs", name="OBS Studio", short_name="OBS", summary="录制屏幕和直播画面，自由组合不同视频来源。", description="适合录制课程、制作演示和进行直播的用户。第一次录制时先做短片测试，确认画面、麦克风和桌面音频均符合需要。", aliases=["OBS", "录屏", "直播软件", "屏幕录制"], tags=["录屏", "直播", "开源"], purposes=["录制屏幕", "直播"], category="media", platforms=["windows", "macos", "linux"], website_url="https://obsproject.com/", docs_url="https://obsproject.com/kb/", github_url="https://github.com/obsproject/obs-studio", download="https://obsproject.com/download"),
    dict(slug="vlc", name="VLC media player", short_name="VLC", summary="播放常见音视频文件，简单管理日常播放需求。", description="适合需要本地播放音视频的用户。由 VideoLAN 提供，支持多种媒体格式。本站只提供官方入口，不提供额外的解码包或安装程序。", aliases=["VLC", "小锥桶", "视频播放器", "播放器"], tags=["音视频", "播放器", "开源"], purposes=["播放视频", "播放音乐"], category="media", platforms=["windows", "macos", "linux", "android", "ios"], website_url="https://www.videolan.org/vlc/", download="https://www.videolan.org/vlc/"),
    dict(slug="python", name="Python", short_name="Python", summary="用于学习编程、自动化脚本与数据处理的语言环境。", description="适合学习 Python 或运行 Python 项目的用户。运行项目时，应优先采用项目声明支持的版本，并通过虚拟环境隔离项目依赖。", aliases=["Python语言", "Python环境", "派森"], tags=["编程语言", "自动化"], purposes=["学习编程", "数据处理", "编写脚本"], category="developer-tools", platforms=["windows", "macos", "linux"], website_url="https://www.python.org/", docs_url="https://docs.python.org/3/", github_url="https://github.com/python/cpython", download="https://www.python.org/downloads/"),
    dict(slug="nodejs", name="Node.js", short_name="Node.js", summary="在电脑或服务器上运行 JavaScript，构建 Web 项目。", description="适合前端开发和运行 JavaScript 服务的用户。安装前请确认项目要求的 Node.js 版本；长期维护项目通常应参考官方支持周期选择版本。", aliases=["Node", "NodeJS", "JavaScript运行环境", "JS环境"], tags=["JavaScript", "运行环境"], purposes=["开发网站", "运行 JavaScript"], category="developer-tools", platforms=["windows", "macos", "linux"], website_url="https://nodejs.org/", docs_url="https://nodejs.org/docs/latest/api/", github_url="https://github.com/nodejs/node", download="https://nodejs.org/en/download"),
]


def seed(db: Session) -> int:
    categories = {}
    for order, (slug, name) in enumerate(CATEGORIES):
        category = db.scalar(select(Category).where(Category.slug == slug))
        if category is None:
            category = Category(slug=slug, name=name, sort_order=order)
            db.add(category)
            db.flush()
        categories[slug] = category.id
    db.commit()
    count = 0
    for entry in SOFTWARE:
        if db.scalar(select(Software.id).where(Software.slug == entry["slug"])):
            continue
        data = dict(entry)
        data["category_id"] = categories[data.pop("category")]
        download = data.pop("download")
        data.update(icon_url=f"/icons/{data['slug']}.svg", latest_version="DEMO", update_level="optional", update_reason="演示资料，不代表当前官方版本或升级建议。请在官方页面核对版本与系统要求。", is_demo=True, published=True)
        data["official_links"] = [
            {"label": "官方网站", "url": data["website_url"], "type": "website", "is_primary": True},
            {"label": "官方下载页面", "url": download, "type": "download"},
        ]
        if data.get("docs_url"):
            data["official_links"].append({"label": "官方文档", "url": data["docs_url"], "type": "docs"})
        CatalogService(db).save(SoftwareWrite(**data), admin_id=None)
        count += 1
    from app.seed_updates import seed_updates
    seed_updates(db)
    return count
