import type { AppTab } from './types.js';
export type NavGroupId = 'market' | 'alerts' | 'explore' | 'research' | 'more';
export const PRIMARY_GROUPS: NavGroupId[] = ['market', 'alerts', 'explore', 'research', 'more'];
export const NAV_GROUP_OF: Record<AppTab, NavGroupId> = {
  market: 'market', alerts: 'alerts',
  crypto_heatmap: 'explore', crypto_radar: 'explore', crypto_bubbles: 'explore',
  ai: 'research', top_alpha: 'research', usa_status: 'research', intelligence: 'research', business_quality: 'research',
  backtest: 'more', status: 'more'
};
export const GROUP_DEFAULT_TAB: Record<NavGroupId, AppTab> = { market: 'market', alerts: 'alerts', explore: 'crypto_heatmap', research: 'ai', more: 'backtest' };
/** Tabs shown in the in-page segmented control. Groups with fewer than 2 entries show none. */
export const GROUP_SECTION_TABS: Record<NavGroupId, AppTab[]> = {
  market: [], alerts: [], more: [],
  explore: ['crypto_heatmap', 'crypto_radar', 'crypto_bubbles'],
  research: ['ai', 'top_alpha', 'usa_status', 'intelligence']
};
/** A hidden tab highlights its parent in the segmented control. */
export const SECTION_PARENT: Partial<Record<AppTab, AppTab>> = { business_quality: 'ai' };
export const GROUP_LABELS: Record<NavGroupId, { ro: string; en: string }> = {
  market: { ro: 'Piață', en: 'Markets' }, alerts: { ro: 'Alerte', en: 'Alerts' },
  explore: { ro: 'Explorează', en: 'Explore' }, research: { ro: 'Analiză', en: 'Research' },
  more: { ro: 'Mai mult', en: 'More' }
};
export const TAB_LABELS: Record<AppTab, { ro: string; en: string }> = {
  market: { ro: 'Scanner', en: 'Scanner' }, alerts: { ro: 'Alerte', en: 'Alerts' },
  crypto_heatmap: { ro: 'Heat Map', en: 'Heat Map' }, crypto_radar: { ro: 'Radar', en: 'Radar' }, crypto_bubbles: { ro: 'Bubbles', en: 'Bubbles' },
  ai: { ro: 'AI Briefing', en: 'AI Briefing' }, top_alpha: { ro: 'Top Alpha', en: 'Top Alpha' },
  usa_status: { ro: 'USA Macro', en: 'USA Macro' }, intelligence: { ro: 'Intelligence', en: 'Intelligence' },
  business_quality: { ro: 'Business Quality', en: 'Business Quality' },
  backtest: { ro: 'Backtest Lab', en: 'Backtest Lab' }, status: { ro: 'System & Bot Health', en: 'System & Bot Health' }
};
