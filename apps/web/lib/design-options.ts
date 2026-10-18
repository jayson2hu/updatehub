export type DesignVariant = 'a' | 'b' | 'c';

export const designOptions: { id: DesignVariant; name: string; description: string; strengths: string[]; tradeoff: string; color: string; recommended?: boolean }[] = [
  { id: 'a', name: '清晰直达', description: '熟悉的手机应用布局，打开就能找软件、看版本、选设备。', strengths: ['清楚的名称与设备层级', '紧凑的软件直达入口', '手机上操作容易理解'], tradeoff: '视觉比较克制，重点放在内容和操作。', color: '#245BDD', recommended: true },
  { id: 'b', name: '更新手册', description: '把日期与版本排成清楚的更新记录，适合经常回来查阅。', strengths: ['日期与更新内容明确对齐', '列表密度高、浏览更快', '安装说明像一份易读手册'], tradeoff: '偏向信息查阅，社区氛围相对弱一些。', color: '#315DB8' },
  { id: 'c', name: '蓝色社区', description: '鲜明的蓝色品牌区域，配合软件图标和独立更新卡片。', strengths: ['品牌辨识度更高', '桌面更新采用双列卡片', '适合后续独立活动推广'], tradeoff: '视觉占用空间更多，需要持续控制首屏高度。', color: '#173B79' },
];

export function isDesignVariant(value: string): value is DesignVariant {
  return value === 'a' || value === 'b' || value === 'c';
}

export function designFromPath(path: string): DesignVariant | null {
  const value = path.match(/^\/designs\/([^/]+)(?:\/|$)/)?.[1];
  return value && isDesignVariant(value) ? value : null;
}

export function designLink(href: string, variant: DesignVariant | null): string {
  if (!variant) return href;
  if (href === '/') return `/designs/${variant}`;
  if (/^\/(software|announcements|promo)(?:[/?#]|$)/.test(href)) return `/designs/${variant}${href}`;
  return href;
}
