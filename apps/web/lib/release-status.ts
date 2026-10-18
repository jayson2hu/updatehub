import type { ReleaseUpdate } from './types';

export function isHistoricalRelease(update: ReleaseUpdate) {
  if (update.kind !== 'release') return false;
  if (update.is_historical) return true;
  if (!update.software) return false;
  if (update.software.update_level !== update.update_level || update.software.update_reason !== update.reason_to_update || update.software.is_demo !== update.is_demo) return true;
  if (update.software.current_release_id) return update.software.current_release_id !== update.id;
  return Boolean(update.software.latest_version && update.software.latest_version !== update.version);
}
