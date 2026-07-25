import { buildSystemPrompt, buildBatchUserPrompt } from '@/lib/prompt';
import type { FilterConfig, PostData, Verdict } from '@/lib/types';
import { allKeep, verdictsFromJson } from './parse';

// OpenAI-compatible classifier: works with any provider exposing the standard
// /chat/completions endpoint (OpenAI, OpenRouter, Groq, Together, Ollama,
// LM Studio, …). Uses `response_format: json_object` — the broadest-supported
// structured-output mode — and relies on the prompt to dictate the exact shape.

export async function classifyOpenAI(posts: PostData[], config: FilterConfig): Promise<Verdict[]> {
  const base = (config.apiBaseUrl || '').trim().replace(/\/+$/, '');
  const key = (config.apiKey || '').trim();
  const model = (config.apiModel || '').trim();
  if (!base || !key || !model) {
    console.warn('[XFF/bg] OpenAI provider not configured (base URL / key / model missing)');
    return allKeep(posts.length);
  }

  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: buildSystemPrompt(config) },
        { role: 'user', content: buildBatchUserPrompt(posts) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`OpenAI-compatible endpoint ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data?.choices?.[0]?.message?.content ?? '';
  console.log('[XFF/bg] OpenAI raw output:', content);
  return verdictsFromJson(String(content), posts.length);
}
