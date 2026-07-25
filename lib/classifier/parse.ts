import type { Verdict } from '@/lib/types';

const keep = (): Verdict => ({ hide: false, reason: '' });

/** A fail-open array of `count` "keep" verdicts. */
export function allKeep(count: number): Verdict[] {
  return Array.from({ length: count }, keep);
}

/**
 * Pull a JSON object out of a model response that may be wrapped in markdown
 * fences or surrounded by prose (weaker OpenAI-compatible models do this).
 */
function coerceJson(raw: string): string {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const first = raw.indexOf('{');
  const last = raw.lastIndexOf('}');
  if (first !== -1 && last > first) return raw.slice(first, last + 1);
  return raw;
}

/**
 * Parse a batch model response of the form
 * `{"results":[{"index","hide","reason"}]}` into an array aligned to the
 * `count` posts (1-based index). Anything missing or malformed fails open
 * (that post is kept), so a bad/partial response never hides the wrong posts.
 */
export function verdictsFromJson(raw: string, count: number): Verdict[] {
  const out = allKeep(count);
  let parsed: unknown;
  try {
    parsed = JSON.parse(coerceJson(raw));
  } catch {
    return out;
  }
  const results = (parsed as { results?: unknown } | null)?.results;
  if (!Array.isArray(results)) return out;
  for (const r of results) {
    const idx = Number((r as { index?: unknown })?.index);
    if (!Number.isInteger(idx) || idx < 1 || idx > count) continue;
    const rec = r as { hide?: unknown; reason?: unknown };
    out[idx - 1] = {
      hide: !!rec.hide,
      reason: typeof rec.reason === 'string' ? rec.reason : '',
    };
  }
  return out;
}
