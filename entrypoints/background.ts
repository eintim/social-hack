import { filterConfig, DEFAULT_CONFIG } from '@/lib/storage';
import { buildSystemPrompt, buildUserPrompt, VERDICT_SCHEMA } from '@/lib/prompt';
import type { FilterConfig, PostData, Verdict } from '@/lib/types';

export default defineBackground(() => {
  console.log('[XFF/bg] background service worker started');
  const NO_HIDE: Verdict = { hide: false, reason: '' };
  const EXPECTED = [{ type: 'text' as const, languages: ['en'] }];

  let config: FilterConfig = DEFAULT_CONFIG;
  filterConfig.getValue().then((c) => {
    config = c;
  });
  filterConfig.watch((c) => {
    config = c;
    resetSession(); // rules/categories may have changed
  });

  // --- LLM session, rebuilt whenever the active criteria change --------------
  let sessionPromise: Promise<LanguageModelSession | null> | null = null;
  let sessionKey = '';

  const keyOf = (c: FilterConfig) =>
    JSON.stringify({ rules: c.rules, categories: c.categories });

  function resetSession() {
    const stale = sessionPromise;
    sessionPromise = null;
    sessionKey = '';
    stale?.then((s) => s?.destroy()).catch(() => {});
  }

  function getSession(c: FilterConfig): Promise<LanguageModelSession | null> {
    const key = keyOf(c);
    if (sessionPromise && key === sessionKey) return sessionPromise;
    resetSession();
    sessionKey = key;
    sessionPromise = (async () => {
      try {
        if (typeof LanguageModel === 'undefined') {
          console.warn('[XFF/bg] LanguageModel API is undefined — Chrome too old or flag disabled');
          return null;
        }
        const availability = await LanguageModel.availability({
          expectedInputs: EXPECTED,
          expectedOutputs: EXPECTED,
        });
        console.log('[XFF/bg] LanguageModel.availability =', availability);
        // Accept both current and older Chrome value spellings.
        if (availability !== 'available' && availability !== 'readily') {
          console.warn('[XFF/bg] model not ready (availability:', availability, ') — posts will not be classified');
          return null;
        }
        console.log('[XFF/bg] creating LanguageModel session…');
        const session = await LanguageModel.create({
          initialPrompts: [{ role: 'system', content: buildSystemPrompt(c) }],
          expectedInputs: EXPECTED,
          expectedOutputs: EXPECTED,
        });
        console.log('[XFF/bg] session created');
        return session;
      } catch (err) {
        console.error('[XFF/bg] session creation failed:', err);
        return null; // API absent (older Chrome) or creation failed
      }
    })();
    return sessionPromise;
  }

  async function classify(post: PostData): Promise<Verdict> {
    if (!config.enabled) return NO_HIDE;
    const hasLlmFilters =
      config.rules.some((r) => r.trim()) || Object.values(config.categories).some(Boolean);
    if (!hasLlmFilters) return NO_HIDE;

    const session = await getSession(config);
    if (!session) {
      console.warn('[XFF/bg] no session available, cannot classify post', post.id);
      return NO_HIDE;
    }

    try {
      const raw = await session.prompt(buildUserPrompt(post), {
        responseConstraint: VERDICT_SCHEMA,
      });
      console.log('[XFF/bg] raw model output for', post.id, ':', raw);
      const parsed = JSON.parse(raw) as Partial<Verdict>;
      const verdict = {
        hide: !!parsed?.hide,
        reason: typeof parsed?.reason === 'string' ? parsed.reason : '',
      };
      console.log('[XFF/bg] classified', post.id, '->', verdict);
      return verdict;
    } catch (err) {
      console.error('[XFF/bg] prompt/parse failed for', post.id, err);
      return NO_HIDE; // parse/prompt failure -> fail open
    }
  }

  // Gemini Nano runs one inference at a time; serialize to avoid thrashing.
  let tail: Promise<unknown> = Promise.resolve();
  function enqueue(post: PostData): Promise<Verdict> {
    const run = tail.then(() => classify(post));
    tail = run.catch(() => {});
    return run;
  }

  browser.runtime.onMessage.addListener((message) => {
    if (message && (message as { type?: string }).type === 'classify') {
      const post = (message as { post: PostData }).post;
      console.log('[XFF/bg] received classify request for', post.id);
      return enqueue(post).catch(() => NO_HIDE);
    }
    return undefined;
  });
});
