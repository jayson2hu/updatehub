'use client';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import { useMySoftware } from '@/hooks/use-my-software';
import { showFollowFeedback } from './follow-feedback';

export function FollowButton({ id, name, compact = false }: { id: string; name: string; compact?: boolean }) {
  const { contains, follow, unfollow } = useMySoftware();
  const selected = contains(id);

  function toggle() {
    const persisted = selected ? unfollow(id) : follow(id);
    showFollowFeedback(persisted
      ? selected ? `已取消关注 ${name}。` : `已关注 ${name}，相关公告会出现在“我的关注”。`
      : selected
        ? '浏览器暂时无法保存。已临时取消关注；刷新或关闭页面后可能恢复原清单。'
        : '浏览器暂时无法保存。已临时关注；刷新或关闭页面后会丢失。请允许本站保存浏览器数据以长期保留。');
  }

  return <button className={`${compact ? 'icon-button follow-compact' : 'button button-secondary'} ${selected ? 'is-followed' : ''}`} aria-label={selected ? `取消关注 ${name}` : `关注 ${name}`} aria-pressed={selected} title={selected ? '取消关注' : '关注相关公告'} onClick={toggle}>
      {selected ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
      {!compact && (selected ? '已关注相关公告' : '关注相关公告')}
    </button>;
}
