import { cache } from 'react';
import { api, ApiError } from './server-api';
import type { ReleaseUpdate, Software } from './types';

export const getCurrentRelease = cache(async (slug: string): Promise<ReleaseUpdate | null> => {
  try { return await api<ReleaseUpdate | null>(`/software/${encodeURIComponent(slug)}/current-release`); }
  catch (error) { if (error instanceof ApiError && error.status === 404) return null; throw error; }
});

export function primaryOfficialLink(software: Software) {
  const links = software.official_links.filter(link => link.is_active && link.id);
  return links.find(link => link.is_primary) || links.find(link => link.type === 'website') || links[0];
}

export function officialLinkLabel(type: string) {
  return type === 'release' ? '查看官方 Release' : type === 'download' || type === 'store' ? '前往官方下载页面' : type === 'docs' ? '查看官方文档' : '前往官方网站';
}
