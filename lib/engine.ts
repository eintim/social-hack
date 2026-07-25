import { filterConfig, DEFAULT_CONFIG } from '@/lib/storage';
import { getAdapter } from '@/lib/adapters';
import type { DebugKind, FilterConfig, Verdict } from '@/lib/types';

/**
 * Generic, platform-independent content-script engine: observes the feed,
 * extracts posts via the active adapter, applies the deterministic author
 * blocklist locally, and defers everything else to the background LLM.
 */
export function startEngine() {
  const adapter = getAdapter(location.hostname);
  if (!adapter) {
    console.warn('[XFF] no adapter for host', location.hostname, '- engine not started');
    return;
  }
  console.log('[XFF] engine started with adapter:', adapter.name);

  let config: FilterConfig = DEFAULT_CONFIG;
  const seen = new WeakSet<HTMLElement>();

  // Remember every post's latest outcome so the debug toggle can paint badges
  // onto posts already on screen — even ones processed while debug was off.
  const outcomes = new WeakMap<
    HTMLElement,
    { label: string; kind: DebugKind; detail: string }
  >();
  const debug = (node: HTMLElement, label: string, kind: DebugKind, detail = label) => {
    outcomes.set(node, { label, kind, detail });
    if (config.debug) adapter!.annotate(node, label, kind, detail);
  };

  async function processPost(node: HTMLElement) {
    if (seen.has(node)) return;
    seen.add(node);

    if (!config.enabled) {
      console.log('[XFF] filtering disabled, skipping post');
      return;
    }
    const post = adapter!.extractPost(node);
    if (!post) {
      console.log('[XFF] could not extract post from node', node);
      debug(node, '? no post data', 'skipped', 'Could not extract text/author from this node — likely not a real post, or the DOM layout changed.');
      return;
    }
    console.log('[XFF] extracted post', { id: post.id, author: post.author, text: post.text.slice(0, 60) });

    // Deterministic author blocklist — no LLM needed.
    if (post.author) {
      const handle = post.author.toLowerCase();
      const blocked = config.blockedAuthors.some(
        (h) => h.replace(/^@/, '').toLowerCase() === handle,
      );
      if (blocked) {
        console.log('[XFF] blocking post — author on blocklist:', post.author);
        adapter!.collapse(node, `author @${post.author}`);
        debug(node, `⛔ blocked @${post.author}`, 'blocked', `Hidden because @${post.author} is on your blocked-authors list (no LLM involved).`);
        return;
      }
    }

    // LLM filters (rules + categories) — skip the round-trip if none are active.
    const hasLlmFilters =
      config.rules.some((r) => r.trim()) || Object.values(config.categories).some(Boolean);
    if (!hasLlmFilters) {
      console.log('[XFF] no active LLM filters (rules/categories), leaving post visible');
      debug(node, '— no active filters', 'skipped', 'Kept because no categories or custom rules are enabled — there is nothing to match against. Turn some on in the popup.');
      return;
    }

    try {
      console.log('[XFF] sending post to background for classification:', post.id);
      debug(node, '… classifying', 'pending', 'Sent to the on-device model — waiting for a verdict.');
      const verdict: Verdict | undefined = await browser.runtime.sendMessage({
        type: 'classify',
        post,
      });
      console.log('[XFF] verdict for', post.id, verdict);
      if (verdict?.hide) {
        const why = verdict.reason || 'matched a filter';
        adapter!.collapse(node, why);
        debug(node, `✕ ${why}`, 'hidden', `Hidden — the model said: ${why}`);
      } else {
        const why = verdict?.reason || 'did not match any active filter';
        debug(node, '✓ kept', 'kept', `Kept — the model said: ${why}`);
      }
    } catch (err) {
      // Background unavailable / errored — leave the post visible (fail open).
      console.warn('[XFF] classify failed, leaving post visible:', err);
      debug(node, '⚠ classify error', 'skipped', `Kept (fail-open) because classification errored: ${String(err)}`);
    }
  }

  let scheduled = false;
  function scan() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const posts = adapter!.findPosts(document);
      console.log('[XFF] scan found', posts.length, 'post node(s) in DOM');
      for (const node of posts) void processPost(node);
    });
  }

  filterConfig.getValue().then((c) => {
    config = c;
    console.log('[XFF] config loaded', c);
    scan();
  });
  filterConfig.watch((c) => {
    const wasDebug = config.debug;
    config = c;
    console.log('[XFF] config changed', c);
    // Toggle debug live on posts already on screen (they're in `seen`, so a
    // re-scan won't revisit them): strip badges when off, repaint from the
    // remembered outcomes when on.
    if (wasDebug && !c.debug) {
      adapter!.clearAnnotations(document);
    } else if (!wasDebug && c.debug) {
      for (const node of adapter!.findPosts(document)) {
        const o = outcomes.get(node);
        if (o) adapter!.annotate(node, o.label, o.kind, o.detail);
      }
    }
    scan();
  });

  new MutationObserver(() => scan()).observe(document.body, {
    childList: true,
    subtree: true,
  });
  scan();
}
