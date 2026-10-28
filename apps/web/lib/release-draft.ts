// Defaults for the quick "发布更新" form: everything a new version can inherit
// from the previous one, so the owner only types a version and one sentence.
import type { Advice, Change, ChangeKind, Platform, Release, Software } from './station-types';
import { byPublishedDesc, dayKey } from './station-view';

/** 4.1.0 → 4.1.1；没有数字结尾时返回空串，让管理员自己填。 */
export function bumpVersion(version?: string) {
  const match = /^(.*?)(\d+)(\D*)$/.exec((version || '').trim());
  return match ? `${match[1]}${Number(match[2]) + 1}${match[3]}` : '';
}

export function publishedReleases(releases: Release[], softwareId: string) {
  return releases.filter(r => r.software_id === softwareId && r.published && r.published_at).sort(byPublishedDesc);
}

/** 上一次一起发布的设备（同一天发布的那批），没有记录时取第一个支持的设备。 */
export function defaultPlatforms(software: Software | undefined, releases: Release[]): Platform[] {
  if (!software) return [];
  const list = publishedReleases(releases, software.id);
  if (!list.length) return software.platforms.slice(0, 1);
  const day = dayKey(list[0].published_at!);
  return software.platforms.filter(p => list.some(r => r.platform === p && dayKey(r.published_at!) === day));
}

export function previousRelease(releases: Release[], softwareId: string, platform: Platform) {
  return publishedReleases(releases, softwareId).find(r => r.platform === platform);
}

/** "先别更新" 时默认推荐的稳定版：该设备最近一个能用、且不是"先别更新"的已发布版本。 */
export function stableCandidates(releases: Release[], softwareId: string, platform: Platform) {
  return publishedReleases(releases, softwareId).filter(r => r.platform === platform && r.status !== 'unavailable' && r.advice !== 'hold');
}

/** 最近有更新的软件排前面，方便直接点选。 */
export function recentSoftware(software: Software[], releases: Release[]) {
  const last = new Map<string, string>();
  for (const r of [...releases].filter(r => r.published_at).sort(byPublishedDesc)) if (!last.has(r.software_id)) last.set(r.software_id, r.published_at!);
  return [...software].sort((a, b) => (last.get(b.id) || '').localeCompare(last.get(a.id) || ''));
}

const PREFIXES: [RegExp, ChangeKind][] = [
  [/^(新增|新功能|增加|支持)[：:\s]*/, 'added'],
  [/^(修复|修正|解决)[：:\s]*/, 'fixed'],
  [/^(优化|改进|提升)[：:\s]*/, 'improved'],
  [/^(已知问题|注意)[：:\s]*/, 'known_issue'],
];
/** 粘贴的官方更新说明：以"新增 / 修复 / 优化 / 已知问题"开头的行自动归类，其余行保留在详细说明里。 */
export function parseChanges(text: string): Change[] {
  const changes: Change[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim().replace(/^[-*•·\d.、)）\s]+/, '');
    for (const [pattern, kind] of PREFIXES) {
      if (pattern.test(line)) { const rest = line.replace(pattern, '').trim(); if (rest) changes.push({ kind, text: rest.slice(0, 500) }); break; }
    }
  }
  return changes.slice(0, 50);
}

export const summaryHints: Record<Advice, string[]> = {
  recommended: ['修复了已知问题，可以放心更新', '旧版即将不能用，建议更新'],
  wait: ['只改了界面，不着急更新', '功能没变化，可以等等'],
  hold: ['有严重问题，官方修复中，先别更新', '已更新的装回稳定版即可'],
  optional: ['小改动，按需更新', '新增功能，用得上再更新'],
};
