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
    'Respond only via the required JSON schema: {"hide": boolean, "reason": string}.',
    'Always fill "reason" with one short sentence explaining your decision:',
    'when hiding, name the matched criterion; when keeping, say why the post relates to none of the criteria.',
  ].join('\n');
}

export function buildUserPrompt(post: PostData): string {
  return `Author: @${post.author}\nPost:\n"""\n${post.text}\n"""`;
}
