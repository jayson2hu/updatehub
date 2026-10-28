import type { Promotion } from './station-types';
import { isPromotionActive } from './station';

// All providers use these positions. Provider destinations never enter release links.
export type AdPlacement = 'home_feed' | 'home_banner' | 'library_bottom' | 'detail_body' | 'announcement_bottom' | 'desktop_sidebar';
export interface AdProvider {
  id: string;
  select: (promotions: Promotion[], placement: AdPlacement) => Promotion | undefined;
}
export const houseAdProvider: AdProvider = {
  id: 'house',
  select: (promotions, placement) => [...promotions].sort((a, b) => a.slug.localeCompare(b.slug)).find(p => p.placements.includes(placement) && isPromotionActive(p)),
};
// Future providers plug into this contract and the same global enable switch.
// Third-party scripts require an explicit CSP/consent review before integration.
