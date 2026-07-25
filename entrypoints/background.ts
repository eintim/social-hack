import { filterConfig, DEFAULT_CONFIG, normalizeConfig } from '@/lib/storage';
import { classifyBatch, resetOnDeviceSession } from '@/lib/classifier';
import { allKeep } from '@/lib/classifier/parse';
import type { FilterConfig, PostData, Verdict } from '@/lib/types';

export default defineBackground(() => {
  console.log('[XFF/bg] background service worker started');

  let config: FilterConfig = DEFAULT_CONFIG;
  filterConfig.getValue().then((c) => {
    config = normalizeConfig(c);
  });
  filterConfig.watch((c) => {
    config = normalizeConfig(c);
    // Criteria or provider may have changed — drop the cached on-device session.
    resetOnDeviceSession();
  });

  // --- Provider-aware batch queue -------------------------------------------
  // On-device (Gemini Nano) runs one inference at a time, so those batches are
  // strictly serialized. OpenAI-compatible endpoints have no single-model
  // bottleneck, so their batches run concurrently up to a small cap.
  const MAX_CONCURRENT = 4;
  let tail: Promise<unknown> = Promise.resolve();
  let active = 0;
  const waiters: Array<() => void> = [];

  async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
    if (active >= MAX_CONCURRENT) await new Promise<void>((r) => waiters.push(r));
    active++;
    try {
      return await fn();
    } finally {
      active--;
      waiters.shift()?.();
    }
  }

  function enqueue(posts: PostData[]): Promise<Verdict[]> {
    const safe = () => classifyBatch(posts, config).catch(() => allKeep(posts.length));
    if ((config.provider ?? 'on-device') === 'openai') {
      return withSlot(safe);
    }
    const run = tail.then(safe);
    tail = run.catch(() => {});
    return run;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message && (message as { type?: string }).type === 'classifyBatch') {
      const posts = (message as { posts: PostData[] }).posts ?? [];
      console.log('[XFF/bg] received classifyBatch for', posts.length, 'post(s)');
      return enqueue(posts).catch(() => allKeep(posts.length));
    }
    return undefined;
  });
});
