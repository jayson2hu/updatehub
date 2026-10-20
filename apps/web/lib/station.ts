import { cache } from 'react';
import { api } from './api';
import type { Announcement, Platform, Promotion, Release, Software, SoftwareData, StationData, Status } from './station-types';

export const getStationData = cache(() => api<StationData>('/station/data'));
export const getStationSoftware = (slug: string) => api<SoftwareData>(`/station/software/${encodeURIComponent(slug)}`);
export const getStationAnnouncement = (slug: string) => api<Announcement>(`/station/announcements/${encodeURIComponent(slug)}`);
export const getStationPromotion = (slug: string) => api<Promotion>(`/station/promo/${encodeURIComponent(slug)}`);
export const platformLabels: Record<Platform, string> = { android: '安卓', ios: '苹果', tv: '电视', desktop: '电脑' };
export const platformNames: Record<Platform, string> = { android: '安卓手机', ios: '苹果手机', tv: '安卓电视', desktop: '电脑' };
export const platformActions: Record<Platform, string> = { android: '获取安卓版', ios: '获取苹果版', tv: '获取电视版', desktop: '获取电脑版' };
export const categoryLabels = { group: '群公告', usage: '使用提醒', maintenance: '维护通知' };
export const allPlatforms: Platform[] = ['android', 'ios', 'tv', 'desktop'];
export function formatDate(value?: string | null) { if (!value) return '尚未发布'; const d = new Date(value); if (Number.isNaN(d.getTime())) return '日期待确认'; return new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d).replaceAll('/', '.'); }
export function isExpired(notice: Announcement, now = Date.now()) { return Boolean(notice.expired || (notice.expires_at && new Date(notice.expires_at).getTime() <= now)); }
export function isPromotionActive(p: Promotion, now = Date.now()) { return p.published && (!p.starts_at || new Date(p.starts_at).getTime() <= now) && (!p.ends_at || new Date(p.ends_at).getTime() > now); }
export function isPromotionEnded(p: Promotion, now = Date.now()) { return Boolean(p.ends_at && new Date(p.ends_at).getTime() <= now); }
export function safeLink(url?: string) { if (!url) return ''; try { const u = new URL(url); return ['https:', 'http:'].includes(u.protocol) ? u.href : ''; } catch { return ''; } }

export function getReleaseState(software: Software, release?: Release): { status: Status; reason: string } {
  if (software.status === 'unavailable') return { status: 'unavailable', reason: software.status_reason };
  if (release?.status === 'unavailable') return { status: 'unavailable', reason: release.status_reason };
  if (software.status === 'attention') return { status: 'attention', reason: software.status_reason };
  if (release?.status === 'attention') return { status: 'attention', reason: release.status_reason };
  return { status: 'normal', reason: '' };
}

export function getSoftwareState(software: Software, releases: Release[], platform?: Platform): { status: Status; reason: string } {
  const ordered = releases.filter(r => r.software_id === software.id).sort((a, b) => (b.published_at || '').localeCompare(a.published_at || ''));
  if (platform) return getReleaseState(software, ordered.find(r => r.platform === platform));
  const states = software.platforms.map(p => getReleaseState(software, ordered.find(r => r.platform === p)));
  if (!states.length || software.status === 'unavailable') return getReleaseState(software);
  if (new Set(states.map(state => state.status)).size > 1) return { status: 'attention', reason: '各设备状态不同，请查看详情' };
  return states[0];
}

/** 本次请求的时间：同一请求内的服务端组件共用同一个"现在"，客户端水合时也用这个值。 */
export const requestNow = cache(() => Date.now());
