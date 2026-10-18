export const platformNames: Record<string, string> = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android', ios: 'iOS', web: 'Web' };
export const levelNames = { critical: '建议尽快更新', recommended: '推荐更新', optional: '可选更新', hold: '建议暂缓' };
export const siteUrl = () => process.env.PUBLIC_SITE_URL || 'http://localhost:3000';
export const announcementKinds = { release: '版本更新', notice: '使用提醒', maintenance: '维护通知' };
export const announcementLevel = (kind: string, level: SoftwareLevel) => kind === 'release' ? levelNames[level] : ({ critical: '重要提醒', recommended: '建议关注', optional: '一般通知', hold: '暂缓操作' }[level]);
type SoftwareLevel = keyof typeof levelNames;
export function announcementDate(value: string | null, full = false) {
  if (!value) return '尚未发布';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '时间待确认';
  return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', ...(full ? { year: 'numeric' as const } : {}), month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
}
