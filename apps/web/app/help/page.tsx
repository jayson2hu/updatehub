import Link from 'next/link';
import { BookOpen, Compass, Library, ListChecks, Search } from 'lucide-react';
import { listContent } from '@/lib/public-content';
import { ContentRow } from '@/components/content/common';
export const metadata = { title: '帮助中心', description: '从选择软件、确认版本到完成更新，查找清楚可执行的答案与使用指南。', alternates: { canonical: '/help' } };
export default async function HelpPage() {
  const [faq, guides] = await Promise.all([listContent('faq', {}, 5), listContent('guide', {}, 3)]);
  return <div className="page-container help-page">
    <header className="help-heading"><h1>下一步，怎么做？</h1><p>找到合适的软件，读懂更新建议，解决使用中的疑问。</p></header>
    <form action="/faq" className="help-search" role="search"><Search size={21}/><label className="sr-only" htmlFor="help-q">搜索常见问题</label><input id="help-q" name="q" type="search" placeholder="例如：选择系统版本、官网打不开、我的关注" maxLength={160}/><button className="button button-primary">查找答案</button></form>
    <div className="help-task-links"><Link href="/start"><ListChecks/><strong>第一次使用</strong><span>选系统、选用途，建立自己的关注清单。</span></Link><Link href="/finder"><Compass/><strong>帮我找软件</strong><span>只记得用途或别名，也可以找到入口。</span></Link><Link href="/collections"><Library/><strong>按场景选软件</strong><span>查看管理员整理的清单，按需选择。</span></Link></div>
    <div className="help-columns"><section><div className="section-heading"><h2>常见问题</h2><Link href="/faq" className="text-link">全部问题</Link></div>{faq.data.items.length ? <div className="faq-list">{faq.data.items.map(item => <details key={item.id}><summary>{item.title}{item.is_demo && <small>演示内容</small>}</summary><div className="faq-answer"><p>{item.content}</p><Link href={`/faq/${item.slug}`} className="text-link">查看完整回答</Link></div></details>)}</div> : <p className="help-empty">暂时还没有发布的问题。你可以先阅读<Link href="/about">公告阅读指南</Link>。</p>}</section>
    <section><div className="section-heading"><h2>使用指南</h2><Link href="/guides" className="text-link">全部指南</Link></div>{guides.data.items.length ? guides.data.items.map(item => <ContentRow key={item.id} item={item}/>) : <p className="help-empty">使用指南发布后会显示在这里。</p>}<Link className="help-about-link" href="/about"><BookOpen size={18}/>了解公告、版本与更新建议的区别</Link></section></div>
    <div className="help-bottom-note"><strong>软件更新以官方资料为准</strong><p>本站帮助内容由管理员维护。安装和更新前，请在软件的官方页面核对系统要求；带有演示标识的版本与建议仅用于体验流程。</p></div>
  </div>;
}
