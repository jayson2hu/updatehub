'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { designOptions, type DesignVariant } from '@/lib/design-options';

export function DesignReviewBar({ variant, path }: { variant: DesignVariant; path: string }) {
  const query = useSearchParams().toString();
  const suffix = `${path === '/' ? '' : path}${query ? '?' + query : ''}`;
  return <div className="dp-toolbar"><div className="dp-toolbar-inner">
    <Link className="dp-overview" href="/designs"><ArrowLeft size={15}/><span>对比</span></Link>
    <nav aria-label="切换设计方案">{designOptions.map(option => <Link key={option.id} href={`/designs/${option.id}${suffix}`} className={option.id === variant ? 'dp-option dp-active' : 'dp-option'} aria-current={option.id === variant ? 'page' : undefined}><b>{option.id.toUpperCase()}</b><span>{option.name}</span></Link>)}</nav>
    <span className="dp-preview-caption">设计预览 · 实际内容与操作</span>
    <Link className="dp-current" href={path + (query ? '?' + query : '')}>当前版本<ArrowUpRight size={14}/></Link>
  </div></div>;
}
