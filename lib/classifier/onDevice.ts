import { buildSystemPrompt, buildBatchUserPrompt, BATCH_VERDICT_SCHEMA } from '@/lib/prompt';
import type { FilterConfig, PostData, Verdict } from '@/lib/types';
import { allKeep, verdictsFromJson } from './parse';

// On-device classifier: Chrome's Prompt API (Gemini Nano). One shared session
// is reused across batches and rebuilt only when the active criteria change.

const EXPECTED = [{ type: 'text' as const, languages: ['en'] }];

let sessionPromise: Promise<LanguageModelSession | null> | null = null;
let sessionKey = '';

// The session bakes in the system prompt, so its identity is the criteria.
const keyOf = (c: FilterConfig) => JSON.stringify({ rules: c.rules, categories: c.categories });

/** Tear down the cached session (e.g. when criteria change). */
export function resetOnDeviceSession() {
  const stale = sessionPromise;
  sessionPromise = null;
  sessionKey = '';
  stale?.then((s) => s?.destroy()).catch(() => {});
}

function getSession(c: FilterConfig): Promise<LanguageModelSession | null> {
  const key = keyOf(c);
  if (sessionPromise && key === sessionKey) return sessionPromise;
  resetOnDeviceSession();
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
      if (availability !== 'available' && availability !== 'readily') {
        console.warn('[XFF/bg] model not ready (availability:', availability, ')');
        return null;
      }
      const session = await LanguageModel.create({
        initialPrompts: [{ role: 'system', content: buildSystemPrompt(c) }],
        expectedInputs: EXPECTED,
        expectedOutputs: EXPECTED,
      });
      console.log('[XFF/bg] on-device session created');
      return session;
    } catch (err) {
      console.error('[XFF/bg] session creation failed:', err);
      return null;
    }
  })();
  return sessionPromise;
}

export async function classifyOnDevice(posts: PostData[], config: FilterConfig): Promise<Verdict[]> {
  const session = await getSession(config);
  if (!session) {
    console.warn('[XFF/bg] no on-device session — keeping all', posts.length, 'post(s)');
    return allKeep(posts.length);
  }
  const raw = await session.prompt(buildBatchUserPrompt(posts), {
    responseConstraint: BATCH_VERDICT_SCHEMA,
  });
  console.log('[XFF/bg] on-device raw output:', raw);
  return verdictsFromJson(raw, posts.length);
}
