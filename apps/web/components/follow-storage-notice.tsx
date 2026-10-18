'use client';
import { useMySoftware } from '@/hooks/use-my-software';

export function FollowStorageText() {
  const { storageUnavailable } = useMySoftware();
  return <>{storageUnavailable
    ? '浏览器暂时无法保存关注。当前清单仅在本次页面会话中保留，刷新或关闭页面后会丢失。'
    : '关注保存在当前浏览器，无需登录。清除浏览器数据后需要重新添加。'}</>;
}

export function FollowStorageNotice({ className = 'storage-notice' }: { className?: string }) {
  return <p className={className}><FollowStorageText /></p>;
}
