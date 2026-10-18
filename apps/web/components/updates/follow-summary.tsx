'use client';
import Link from 'next/link';
import { Bookmark, ArrowRight, Plus } from 'lucide-react';
import { useMySoftware } from '@/hooks/use-my-software';
import { FollowStorageText } from '@/components/follow-storage-notice';
export function FollowSummary() {
  const { ids } = useMySoftware();
  return <section className="bulletin-follow"><div className="aside-heading"><Bookmark size={19}/><h2>与我有关的公告</h2></div><p>{ids.length ? `已关注 ${ids.length} 款软件，集中查看它们的公告。` : '关注你在使用的软件，集中查看相关公告。'}</p><Link href={ids.length ? '/my-software' : '/software'}>{ids.length ? '查看关注公告' : '添加关注'}{ids.length ? <ArrowRight size={16}/> : <Plus size={16}/>}</Link><small><FollowStorageText/></small></section>;
}
