import { storage } from '#imports';
import type { FilterConfig } from './types';
import { CATEGORIES } from './categories';

export const DEFAULT_CONFIG: FilterConfig = {
  enabled: true,
  rules: [],
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, false])),
  blockedAuthors: [],
  debug: false,
  showEngagement: true,
  engagementHighPct: 3,
  hideLowEngagement: false,
  hideLowEngagementPct: 1,
  provider: 'on-device',
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o-mini',
};

/** Merge stored config with defaults so new fields work for older installs. */
export function normalizeConfig(c: Partial<FilterConfig> | null | undefined): FilterConfig {
  return {
    ...DEFAULT_CONFIG,
    ...c,
    categories: { ...DEFAULT_CONFIG.categories, ...(c?.categories ?? {}) },
    rules: c?.rules ?? DEFAULT_CONFIG.rules,
    blockedAuthors: c?.blockedAuthors ?? DEFAULT_CONFIG.blockedAuthors,
    showEngagement: c?.showEngagement ?? DEFAULT_CONFIG.showEngagement,
    engagementHighPct: c?.engagementHighPct ?? DEFAULT_CONFIG.engagementHighPct,
    hideLowEngagement: c?.hideLowEngagement ?? DEFAULT_CONFIG.hideLowEngagement,
    hideLowEngagementPct: c?.hideLowEngagementPct ?? DEFAULT_CONFIG.hideLowEngagementPct,
    provider: c?.provider ?? DEFAULT_CONFIG.provider,
    apiBaseUrl: c?.apiBaseUrl ?? DEFAULT_CONFIG.apiBaseUrl,
    apiKey: c?.apiKey ?? DEFAULT_CONFIG.apiKey,
    apiModel: c?.apiModel ?? DEFAULT_CONFIG.apiModel,
    debug: c?.debug ?? DEFAULT_CONFIG.debug,
    enabled: c?.enabled ?? DEFAULT_CONFIG.enabled,
  };
}

/**
 * Single source of truth for filter settings. Popup writes it; content script
 * and background react via `.watch()`.
 */
export const filterConfig = storage.defineItem<FilterConfig>('local:filterConfig', {
  fallback: DEFAULT_CONFIG,
});
