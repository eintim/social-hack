import type { FilterConfig, PostData } from './types';
import { CATEGORIES } from './categories';

/** JSON schema constraining the model's output to a binary verdict + reason. */
export const VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    hide: { type: 'boolean' },
    reason: { type: 'string' },
  },
  required: ['hide', 'reason'],
} as const;

/**
 * Schema for a batch verdict: one result per post, keyed by the 1-based index
 * used in the batch user prompt. Wrapped in an object because OpenAI's
 * structured-output root must be an object (Gemini Nano accepts it too).
 */
export const BATCH_VERDICT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    results: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          index: { type: 'integer' },
          hide: { type: 'boolean' },
          reason: { type: 'string' },
        },
        required: ['index', 'hide', 'reason'],
      },
    },
  },
  required: ['results'],
} as const;

/** Collect the active criteria (enabled categories + non-empty rules). */
export function activeCriteria(config: FilterConfig): string[] {
  const criteria: string[] = [];
  for (const cat of CATEGORIES) {
    if (config.categories[cat.id]) criteria.push(cat.description);
  }
  for (const rule of config.rules) {
    const r = rule.trim();
    if (r) criteria.push(r);
  }
  return criteria;
}

export function buildSystemPrompt(config: FilterConfig): string {
  const list = activeCriteria(config)
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n');
  return [
    'You are an aggressive content filter for social media (X / Twitter) posts.',
    'Your job is to HIDE every post that relates to ANY of these criteria:',
    list,
    '',
    'Rules:',
    '- HIDE the post if it matches, relates to, mentions, promotes, or is even loosely on the topic of ANY criterion above. Partial or topical relevance is enough.',
    '- Err strongly on the side of hiding. When a post is borderline or you are unsure whether it matches, HIDE it.',
    '- Treat marketing language, sponsored/promotional tone, calls to buy/sign up/click, and self-promotion as matching an "ads / promotions" criterion even if not explicitly labeled as an ad.',
    '- Consider hashtags, @-mentions, links, emojis, and implied subject matter — not just the literal sentence — when deciding the topic.',
    '- Only KEEP a post when it clearly has nothing to do with any criterion.',
    '- Judge only the post content provided, not your general opinions.',
    '',
    'You will be given one or more numbered posts. Return a JSON object of the form',
    '{"results": [{"index": <post number>, "hide": <boolean>, "reason": <string>}, ...]}',
    'with exactly one entry per post, matching each post\'s number.',
    'Always fill "reason" with one short, concrete sentence about the post itself.',
    '- When hiding: name the matched criterion and how the post relates to it.',
    '- When keeping: briefly state what the post is actually about (topic or gist).',
    '- Never write meta reasons like "does not match", "none of the criteria",',
    '  "unrelated to the filters", or similar. Always describe the post content.',
  ].join('\n');
}

/** Single-post user message (kept for reference / non-batch callers). */
export function buildUserPrompt(post: PostData): string {
  return `Author: @${post.author}\nPost:\n"""\n${post.text}\n"""`;
}

/** Enumerate posts with 1-based indices for a batch classification request. */
export function buildBatchUserPrompt(posts: PostData[]): string {
  const blocks = posts.map(
    (p, i) => `Post ${i + 1} (@${p.author || 'unknown'}):\n"""\n${p.text}\n"""`,
  );
  return [
    `Classify the following ${posts.length} post(s). Return one result per post, by index.`,
    '',
    blocks.join('\n\n'),
  ].join('\n');
}
