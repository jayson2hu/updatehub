import Link from 'next/link';
import { ArrowRight, Info } from 'lucide-react';
import { getContent, type ContentKind } from '@/lib/public-content';
import { ContentBody, HelpBreadcrumb } from './common';
import { CopyAnnouncementLink } from '@/components/updates/copy-link';
import { CollectionSelection } from './selection';
import { SoftwareIcon } from '@/components/software-icon';
import { siteUrl } from '@/lib/format';
import { contentPublicPath } from '@/lib/content-types';

const parent = { guide: { href: '/guides', label: '使用指南' }, faq: { href: '/faq', label: '常见问题' }, collection: { href: '/collections', label: '软件合集' } };
export async function ContentDetail({ kind, slug }: { kind: ContentKind; slug: string }) {
  const item = await getContent(kind, slug);
  const structured = { '@context': 'https://schema.org', ...(kind === 'faq' ? { '@type': 'FAQPage', mainEntity: [{ '@type': 'Question', name: item.title, acceptedAnswer: { '@type': 'Answer', text: item.content } }] } : kind === 'guide' ? { '@type': 'Article', headline: item.title, description: item.summary, datePublished: item.published_at, dateModified: item.updated_at } : { '@type': 'ItemList', name: item.title, itemListElement: item.items.map((member, index) => ({ '@type': 'ListItem', position: index + 1, name: member.software.name, url: `${siteUrl()}/software/${member.software.slug}` })) }), url: `${siteUrl()}${contentPublicPath(item)}` };
  return <div className="page-container help-page help-detail">{!item.is_demo && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}/>}<HelpBreadcrumb title={item.title} parent={parent[kind]}/><header className="help-heading"><div className="content-row-meta">{item.category?.name || parent[kind].label}{item.is_demo && <span>演示内容</span>}</div><h1>{item.title}</h1>{item.summary && <p>{item.summary}</p>}<div className="help-detail-meta"><span>维护于 {new Date(item.updated_at).toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' })}</span><CopyAnnouncementLink label="复制内容链接"/></div></header>
    {item.is_demo && <div className="notice notice-demo"><Info size={18}/><p>此内容用于演示管理和阅读流程，请先核对实际适用条件。</p></div>}
    <div className="help-article-layout"><article><ContentBody item={item}/>{kind === 'collection' && <CollectionSelection items={item.items} title={item.title}/>}</article><aside className="help-article-aside">{item.sections.length > 0 && <nav aria-label="文章目录"><h2>本文内容</h2>{item.sections.map((section, index) => <a key={index} href={`#section-${index + 1}`}>{section.title}</a>)}</nav>}{item.software && <section><h2>相关软件</h2><Link className="help-software" href={`/software/${item.software.slug}`}><SoftwareIcon name={item.software.name} src={item.software.icon_url} size={32}/><strong>{item.software.name}</strong></Link><Link href={`/software/${item.software.slug}`} className="text-link">查看版本与官方入口<ArrowRight size={16}/></Link></section>}<section><h2>继续下一步</h2><Link href="/updates">查看最新公告</Link><Link href="/faq">查找常见问题</Link><Link href="/start">建立我的关注清单</Link></section></aside></div>
    <div className="help-bottom-note"><strong>适用情况不同，操作前先核对</strong><p>请结合软件官方文档和你所在团队的要求使用本指南。本站不托管安装包，软件档案中提供官方入口。</p><Link href={parent[kind].href} className="text-link">返回{parent[kind].label}</Link></div>
  </div>;
}
