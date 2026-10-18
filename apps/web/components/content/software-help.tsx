import Link from 'next/link';
import { listContent } from '@/lib/public-content';
import { ContentRow } from './common';
export async function SoftwareHelp({ id, name }: { id: string; name: string }) {
  const [guides, faqs] = await Promise.all([listContent('guide', { software_id: id }, 3), listContent('faq', { software_id: id }, 4)]);
  return <section id="software-help" className="software-help content-section"><div className="section-heading"><h2>使用帮助</h2><Link href="/help" className="text-link">帮助中心</Link></div>{guides.data.items.map(item => <ContentRow key={item.id} item={item}/>)}{faqs.data.items.length > 0 && <div className="faq-list">{faqs.data.items.map(item => <details key={item.id}><summary>{item.title}{item.is_demo && <small>演示内容</small>}</summary><div className="faq-answer"><p>{item.content}</p><Link className="text-link" href={`/faq/${item.slug}`}>查看完整回答</Link></div></details>)}</div>}{!guides.data.total && !faqs.data.total && <p>暂未发布 {name} 的专属帮助。可以查看通用的安装、版本选择与更新问题。</p>}<div className="button-row"><Link href={`/faq${faqs.data.total ? `?software_id=${id}` : ''}`} className="text-link">{faqs.data.total ? '更多相关问题' : '查看常见问题'}</Link>{guides.data.total > 3 && <Link href={`/guides?software_id=${id}`} className="text-link">更多相关指南</Link>}</div></section>;
}
