import Link from 'next/link';
import { Search, SearchX } from 'lucide-react';
import { api } from '@/lib/server-api';
import type { Category } from '@/lib/types';
import { listContent, param, type ContentKind, type QueryParams } from '@/lib/public-content';
import { ContentBody, ContentRow, ContentPagination, HelpBreadcrumb } from './common';
import { SearchTracker } from '@/components/search-tracker';

const labels = {
  guide: { title: '使用指南', intro: '按步骤完成安装准备、版本确认与更新后的检查。', base: '/guides', placeholder: '搜索操作或软件名称', scope: 'guides' as const },
  faq: { title: '常见问题', intro: '关于官方入口、系统选择、更新建议与关注清单的答案。', base: '/faq', placeholder: '输入你的问题，例如：官网打不开', scope: 'faq' as const },
  collection: { title: '软件合集', intro: '按使用场景整理的软件清单，了解用途后再按需选择。', base: '/collections', placeholder: '搜索用途，例如：开发、办公、设计', scope: 'collections' as const },
};

export async function ContentListing({ kind, params }: { kind: ContentKind; params: QueryParams }) {
  const config = labels[kind];
  const [{ data, query }, categories] = await Promise.all([listContent(kind, params), api<Category[]>('/categories')]);
  const q = query.get('q') || '';
  return <div className="page-container help-page"><HelpBreadcrumb title={config.title}/><header className="help-heading"><h1>{config.title}</h1><p>{config.intro}</p></header><SearchTracker query={q} total={data.total} scope={config.scope}/>
    <form action={config.base} className="content-filter" role="search"><div className="help-search"><Search size={20}/><label className="sr-only" htmlFor="content-q">{kind === 'faq' ? '搜索常见问题' : `搜索${config.title}`}</label><input id="content-q" name="q" type="search" maxLength={160} defaultValue={q} key={q} placeholder={config.placeholder}/><button className="button button-primary">搜索</button></div><div className="content-filter-options"><label>分类<select name="category" key={param(params.category)} defaultValue={param(params.category)}><option value="">全部分类</option>{categories.map(category => <option key={category.id} value={category.slug}>{category.name}</option>)}</select></label>{['software_id', 'platform', 'purpose'].map(key => query.get(key) && <input key={key} type="hidden" name={key} value={query.get(key)!}/>)}<button className="button button-secondary">应用筛选</button>{['q', 'category', 'software_id', 'platform', 'purpose'].some(key => query.get(key)) && <Link href={config.base} className="text-link">清除筛选</Link>}</div></form>
    <div className="content-list-heading"><p>共 {data.total} {kind === 'faq' ? '个问题' : kind === 'guide' ? '篇指南' : '个合集'}{q && `，搜索“${q}”`}</p>{param(params.software_id) && <span>仅显示相关软件的内容</span>}</div>
    {!data.items.length ? <div className="empty-state"><SearchX size={35}/><h2>暂时没有匹配的{config.title}</h2><p>可以缩短关键词或清除筛选，也可以回到帮助中心选择其他任务。</p><div className="button-row"><Link href={config.base} className="button button-primary">查看全部{config.title}</Link><Link href="/help" className="button button-secondary">返回帮助中心</Link></div></div> : kind === 'faq' ? <div className="faq-list faq-full-list">{data.items.map(item => <details key={item.id} open={Boolean(q)}><summary>{item.title}{item.is_demo && <small>演示内容</small>}</summary><div className="faq-answer"><ContentBody item={item}/><div className="button-row"><Link href={`/faq/${item.slug}`} className="text-link">查看完整回答</Link>{item.software && <Link href={`/software/${item.software.slug}`} className="text-link">查看 {item.software.short_name || item.software.name} 档案</Link>}</div></div></details>)}</div> : <div className="content-list">{data.items.map(item => <ContentRow key={item.id} item={item}/>)}</div>}
    <ContentPagination data={data} query={query} base={config.base}/>
  </div>;
}
