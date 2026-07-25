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
    'You are a strict content filter for social media (X / Twitter) posts.',
    'Decide whether to HIDE the post shown by the user.',
    'Hide the post only if it clearly matches ANY of these criteria:',
    list,
    '',
    'Rules:',
    '- Only hide when the post clearly matches a criterion. When unsure, do NOT hide.',
    '- Judge only the post content provided, not your general opinions.',
    'Respond only via the required JSON schema: {"hide": boolean, "reason": string}.',
    'Always fill "reason" with one short sentence explaining your decision:',
    'when hiding, name the matched criterion; when keeping, say why the post matches none of the criteria.',
  ].join('\n');
}

export function buildUserPrompt(post: PostData): string {
  return `Author: @${post.author}\nPost:\n"""\n${post.text}\n"""`;
}
