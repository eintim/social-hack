import type { DebugKind, PlatformAdapter } from '@/lib/types';

// All X-specific (and inherently brittle) DOM knowledge is confined here.

const PLACEHOLDER_ATTR = 'data-xff-placeholder';
const DEBUG_ATTR = 'data-xff-debug';

const DEBUG_COLORS: Record<DebugKind, string> = {
  pending: 'rgb(255, 173, 31)', // amber — awaiting verdict
  kept: 'rgb(0, 186, 124)', // green — visible
  hidden: 'rgb(244, 33, 46)', // red — hidden by LLM
  blocked: 'rgb(120, 86, 255)', // purple — author blocklist
  skipped: 'rgb(113, 118, 123)', // gray — not evaluated
};

// --- Fast custom tooltip -----------------------------------------------------
// The native `title` attribute takes ~1.5s to appear and can't be styled. This
// is a single shared, instantly-shown tooltip reused by every debug badge.
let tipEl: HTMLElement | null = null;

function ensureTip(): HTMLElement {
  if (tipEl) return tipEl;
  const el = document.createElement('div');
  el.setAttribute('data-xff-tip', 'true');
  el.style.cssText =
    'position:fixed;z-index:2147483647;pointer-events:none;max-width:300px;' +
    'padding:8px 10px;border-radius:8px;background:rgb(21,24,28);color:rgb(231,233,234);' +
    'font-family:system-ui,-apple-system,sans-serif;font-size:12px;line-height:1.45;' +
    'white-space:normal;box-shadow:0 4px 20px rgba(0,0,0,0.55);' +
    'border:1px solid rgb(47,51,54);opacity:0;transition:opacity 80ms ease;';
  document.body.appendChild(el);
  tipEl = el;
  return el;
}

function showTip(badge: HTMLElement, text: string) {
  if (!text) return;
  const el = ensureTip();
  el.textContent = text;
  el.style.opacity = '1';
  // Measure now that content is set, then right-align under the badge.
  const b = badge.getBoundingClientRect();
  const left = Math.max(8, Math.min(b.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8));
  el.style.left = `${left}px`;
  el.style.top = `${b.bottom + 6}px`;
}

function hideTip() {
  if (tipEl) tipEl.style.opacity = '0';
}

function extractId(node: HTMLElement): string {
  const link = node.querySelector('a[href*="/status/"]');
  const m = link?.getAttribute('href')?.match(/status\/(\d+)/);
  return m ? m[1] : '';
}

export const xAdapter: PlatformAdapter = {
  name: 'x',

  findPosts(root) {
    return Array.from(root.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
  },

  extractPost(node) {
    const textNodes = node.querySelectorAll('[data-testid="tweetText"]');
    const text = Array.from(textNodes)
      .map((n) => n.textContent ?? '')
      .join('\n')
      .trim();

    const userName = node.querySelector('[data-testid="User-Name"]');
    const handleMatch = userName?.textContent?.match(/@(\w{1,15})/);
    const author = handleMatch ? handleMatch[1] : '';

    if (!text && !author) return null;
    return { id: extractId(node) || `${author}:${text.slice(0, 24)}`, author, text };
  },

  collapse(node, reason) {
    if (node.dataset.xffCollapsed === 'true' || node.dataset.xffRevealed === 'true') return;
    node.dataset.xffCollapsed = 'true';

    for (const child of Array.from(node.children)) {
      if ((child as HTMLElement).hasAttribute(DEBUG_ATTR)) continue; // keep the debug badge visible
      (child as HTMLElement).style.display = 'none';
    }

    const ph = document.createElement('div');
    ph.setAttribute(PLACEHOLDER_ATTR, 'true');
    // Flat, full-width row that reads as part of the timeline rather than a
    // floating card: inherits X's font, no border/radius, muted color.
    ph.style.cssText =
      'box-sizing:border-box;display:flex;align-items:center;justify-content:space-between;' +
      'gap:12px;width:100%;padding:12px 16px;' +
      'font-family:inherit;font-size:15px;line-height:20px;color:rgb(113,118,123);';

    const label = document.createElement('span');
    label.textContent = `Hidden — ${reason}`;
    label.style.cssText = 'flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

    const btn = document.createElement('button');
    btn.textContent = 'Show';
    // Subtle inline text link, matching X's accent, not a filled pill.
    btn.style.cssText =
      'flex:none;cursor:pointer;border:none;background:none;padding:0;' +
      'color:rgb(29,155,240);font-size:15px;font-weight:600;line-height:20px;';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      xAdapter.restore(node);
    });

    ph.append(label, btn);
    node.appendChild(ph);
  },

  restore(node) {
    node.querySelectorAll(`:scope > [${PLACEHOLDER_ATTR}]`).forEach((el) => el.remove());
    for (const child of Array.from(node.children)) {
      (child as HTMLElement).style.display = '';
    }
    delete node.dataset.xffCollapsed;
    node.dataset.xffRevealed = 'true';
  },

  annotate(node, label, kind, detail) {
    // A small pill in the post's top-right corner showing what the filter did.
    // `cursor:help` + a native `title` reveal the full reason on hover.
    let badge = node.querySelector<HTMLElement>(`:scope > [${DEBUG_ATTR}]`);
    if (!badge) {
      badge = document.createElement('div');
      badge.setAttribute(DEBUG_ATTR, 'true');
      badge.style.cssText =
        'position:absolute;top:6px;right:6px;z-index:9999;cursor:help;' +
        'max-width:70%;padding:2px 8px;border-radius:9999px;' +
        'font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;' +
        'font-weight:700;line-height:1.4;color:#fff;white-space:nowrap;' +
        'overflow:hidden;text-overflow:ellipsis;box-shadow:0 1px 3px rgba(0,0,0,0.4);';
      if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
      // Instant custom tooltip; reads the current reason from the dataset.
      badge.addEventListener('mouseenter', () => showTip(badge!, badge!.dataset.xffTip || ''));
      badge.addEventListener('mouseleave', hideTip);
      node.appendChild(badge);
    }
    badge.style.display = 'block';
    badge.style.background = DEBUG_COLORS[kind];
    badge.textContent = label;
    badge.dataset.xffTip = detail || label; // full reason, shown on hover
  },

  clearAnnotations(root) {
    root.querySelectorAll(`[${DEBUG_ATTR}]`).forEach((el) => el.remove());
    hideTip();
  },
};
