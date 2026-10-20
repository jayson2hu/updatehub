import type { Metadata } from 'next';
import Link from 'next/link';
import { getStationData } from '@/lib/station';
import type { Settings } from '@/lib/station-types';

// 站点设置没有填写时使用的默认说明（隐私说明须包含 R-GLOBAL-09 要求的内容）。
const DEFAULTS = {
  about: (name: string) => `${name}是群友整理的软件更新站：把群里常用软件的新版本、更新建议、下载入口和安装教程放在一处，不用再翻聊天记录。\n\n每个版本都标明「建议更新 / 可以等等 / 先别更新 / 可选更新」，有问题的版本会推荐稳定版。本站只整理官方发布的信息和官方下载地址，不存放、不修改任何安装包。`,
  privacy: '不收集个人信息，也不需要注册。反馈和“想要的软件”都是匿名提交，不记录 IP、设备型号或访客标识。\n\n收藏、最近看过、常用设备和反馈记录只保存在这台设备的浏览器里，清除浏览器数据后会消失。需要换设备时可以生成同步码，同步码只包含收藏的软件列表，30 天后自动删除。\n\n统计只记录按日汇总的次数（例如某个软件今天被看了多少次），不记录 IP 和访客标识，保留 90 天。问题反馈的说明文字保留 180 天，用于群主排查问题。',
  disclaimer: '本站内容由群友整理，仅供参考。版本信息、更新建议和教程可能不完全准确，请以软件官方发布的信息为准。\n\n下载按钮指向软件官方网站、应用商店或官方提供的网盘，本站不提供安装包，也不对第三方网站的内容负责。安装前请确认来源，遇到问题可以在群里联系群主。',
};
const paragraphs = (text: string) => text.split(/\n\s*\n|\n/).map(p => p.trim()).filter(Boolean);

async function settings(): Promise<Settings | null> { try { return (await getStationData()).settings; } catch { return null; } }

export async function generateMetadata(): Promise<Metadata> {
  const s = await settings();
  const name = s?.site_name || '版本喵';
  return { title: `关于${name}`, description: `${name}的介绍、隐私说明和免责声明。`, alternates: { canonical: '/about' } };
}

export default async function AboutPage() {
  const s = await settings();
  const name = s?.site_name || '版本喵';
  const sections: [string, string, string][] = [
    ['about', `关于${name}`, s?.about_text?.trim() || DEFAULTS.about(name)],
    ['privacy', '隐私说明', s?.privacy_text?.trim() || DEFAULTS.privacy],
    ['disclaimer', '免责声明', s?.disclaimer_text?.trim() || DEFAULTS.disclaimer],
  ];
  return <div className="sv-container sv-article-wrap">
    <article className="sv-article">
      <h1>关于本站</h1>
      <nav className="sv-chips sv-chips--wrap sv-u-mb12" aria-label="本页目录">{sections.map(([id, title]) => <a key={id} className="sv-chip" href={`#${id}`}>{title}</a>)}</nav>
      {sections.map(([id, title, text]) => <section key={id} id={id} className="sv-about-sec" aria-labelledby={`${id}-title`}>
        <h2 id={`${id}-title`}>{title}</h2>
        <div className="sv-article__body">{paragraphs(text).map((p, i) => <p key={i}>{p}</p>)}</div>
      </section>)}
      <p className="sv-u-mt16"><Link className="sv-btn sv-btn--ghost sv-btn--block" href="/">回首页</Link></p>
    </article>
  </div>;
}
