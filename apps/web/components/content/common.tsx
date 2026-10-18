import Link from 'next/link';
import { ArrowLeft, ArrowRight, ChevronRight, BookOpen, Library } from 'lucide-react';
import type { ContentDocument } from '@/lib/content-types';
import type { Paginated } from '@/lib/types';
import { contentUrl } from '@/lib/public-content';

export function HelpBreadcrumb({ title, parent }: { title: string; parent?: { href: string; label: string } }) {
  return <nav className="breadcrumbs" aria-label="面包屑"><Link href="/">公告中心</Link><ChevronRight size={13}/><Link href="/help">帮助中心</Link>{parent && <><ChevronRight size={13}/><Link href={parent.href}>{parent.label}</Link></>}<ChevronRight size={13}/><span>{title}</span></nav>;
}

export function ContentBody({ item }: { item: ContentDocument }) {
  return <div className="help-prose">{item.content && <div className="help-paragraphs">{item.content.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}</div>}{item.sections.map((section, index) => <section key={index} id={`section-${index + 1}`}><h2>{section.title}</h2><div className="help-paragraphs">{section.body.split(/\n\s*\n/).filter(Boolean).map((paragraph, p) => <p key={p}>{paragraph}</p>)}</div></section>)}</div>;
}

export function ContentRow({ item }: { item: ContentDocument }) {
  return <article className="content-row"><div className="content-row-icon">{item.kind === 'collection' ? <Library size={22}/> : <BookOpen size={22}/>}</div><div><div className="content-row-meta">{item.category?.name || (item.kind === 'collection' ? '场景清单' : '使用指南')}{item.is_demo && <span>演示内容</span>}</div><h2><Link href={contentUrl(item)}>{item.title}</Link></h2><p>{item.summary}</p>{item.kind === 'collection' && <small>{item.items.length} 款已收录软件{item.purposes.length > 0 && ` · ${item.purposes.join('、')}`}</small>}{item.software && <Link className="text-link" href={`/software/${item.software.slug}`}>{item.software.name}</Link>}</div><Link href={contentUrl(item)} className="content-row-open" aria-label={`查看${item.title}`}><ArrowRight size={20}/></Link></article>;
}

export function ContentPagination({ data, query, base }: { data: Paginated<ContentDocument>; query: URLSearchParams; base: string }) {
  if (data.total <= data.page_size) return null;
  const href = (page: number) => { const next = new URLSearchParams(query); next.delete('page_size'); next.set('page', String(page)); return `${base}?${next}`; };
  return <nav className="pagination" aria-label="内容分页">{data.page > 1 && <Link href={href(data.page - 1)} className="button button-secondary"><ArrowLeft size={16}/>上一页</Link>}<span>第 {data.page} / {Math.ceil(data.total / data.page_size)} 页</span>{data.page * data.page_size < data.total && <Link href={href(data.page + 1)} className="button button-secondary">下一页<ArrowRight size={16}/></Link>}</nav>;
}
