'use client';
import { api } from './api';
import type { IssueKind, Release, Software } from './station-types';
import { feedbackStore } from '@/hooks/use-station-local';

export interface VoteResult { receipt: string; oks: number; issues: number }
export async function castFeedback(software: Software, release: Release, verdict: 'ok' | 'issue' | 'none', detail?: { kind: IssueKind; note: string }) {
  const current = feedbackStore.get().find(r => r.releaseId === release.id);
  if (current && !current.receipt) throw new Error('这条反馈来自旧版，暂不能修改。新发布的版本可正常改投或撤销。');
  const result = await api<VoteResult>('/station/feedback/vote', { method: 'POST', body: JSON.stringify({ release_id: release.id, verdict, receipt: current?.receipt || '', channel: 'web', action: detail ? 'details' : 'vote', ...detail }) });
  feedbackStore.set(prev => verdict === 'none' ? prev.filter(r => r.releaseId !== release.id) : [{ releaseId: release.id, softwareId: software.id, name: software.name, version: release.version, platform: release.platform, verdict, ...detail, ...result, at: new Date().toISOString() }, ...prev.filter(r => r.releaseId !== release.id)].slice(0, 200));
  window.dispatchEvent(new CustomEvent('station:vote', { detail: { id: release.id, ...result } }));
  return result;
}
