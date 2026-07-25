import { storage } from '#imports';
import type { FilterConfig } from './types';
import { CATEGORIES } from './categories';

export const DEFAULT_CONFIG: FilterConfig = {
  enabled: true,
  rules: [],
  categories: Object.fromEntries(CATEGORIES.map((c) => [c.id, false])),
  blockedAuthors: [],
  debug: false,
  provider: 'on-device',
  apiBaseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  apiModel: 'gpt-4o-mini',
};

/**
 * Single source of truth for filter settings. Popup writes it; content script
 * and background react via `.watch()`.
 */
export const filterConfig = storage.defineItem<FilterConfig>('local:filterConfig', {
  fallback: DEFAULT_CONFIG,
});
