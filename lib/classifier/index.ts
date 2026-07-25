import type { FilterConfig, PostData, Verdict } from '@/lib/types';
import { allKeep } from './parse';
import { classifyOnDevice } from './onDevice';
import { classifyOpenAI } from './openai';

export { resetOnDeviceSession } from './onDevice';

/** True if any category or non-empty custom rule is active. */
export function hasActiveFilters(config: FilterConfig): boolean {
  return (
    config.rules.some((r) => r.trim()) ||
    Object.values(config.categories).some(Boolean)
  );
}

/**
 * Classify a batch of posts with the configured provider. Returns a Verdict per
 * post, aligned by index. Fails open (all "keep") on any misconfig or error, so
 * a broken provider never hides posts.
 */
export async function classifyBatch(posts: PostData[], config: FilterConfig): Promise<Verdict[]> {
  if (!config.enabled || !hasActiveFilters(config) || posts.length === 0) {
    return allKeep(posts.length);
  }
  const provider = config.provider ?? 'on-device';
  try {
    return provider === 'openai'
      ? await classifyOpenAI(posts, config)
      : await classifyOnDevice(posts, config);
  } catch (err) {
    console.warn('[XFF/bg] classifyBatch failed, keeping all posts:', err);
    return allKeep(posts.length);
  }
}
