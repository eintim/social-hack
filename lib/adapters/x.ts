import type { DebugKind, PlatformAdapter } from '@/lib/types';

// All X-specific (and inherently brittle) DOM knowledge is confined here.

const PLACEHOLDER_ATTR = 'data-xff-placeholder';
const DEBUG_ATTR = 'data-xff-debug';
const DEBUG_SLOT_ATTR = 'data-xff-debug-slot';

/** X-native accent colors so the badge reads as part of the action row. */
const DEBUG_COLORS: Record<DebugKind, string> = {
  pending: 'rgb(255, 212, 0)',
  kept: 'rgb(0, 186, 124)',
  hidden: 'rgb(249, 24, 128)',
  blocked: 'rgb(120, 86, 255)',
  skipped: 'rgb(113, 118, 123)',
};

/**
 * The reply/repost/like row for this article. Skips buttons that live inside a
 * quoted/nested tweet so we don't hang the badge on the wrong group.
 */
function findActionBar(article: HTMLElement): HTMLElement | null {
  for (const reply of article.querySelectorAll('[data-testid="reply"]')) {
    const nested = reply.closest('article[data-testid="tweet"], [data-testid="quoteTweet"]');
    if (nested && nested !== article) continue;
    const group = reply.closest<HTMLElement>('[role="group"]');
    if (group && article.contains(group)) return group;
  }
  return null;
}

/** Style the badge for an action-bar slot (or the collapsed placeholder). */
function styleBadge(badge: HTMLElement, kind: DebugKind) {
  const color = DEBUG_COLORS[kind];
  badge.style.cssText =
    'box-sizing:border-box;display:inline-flex;align-items:center;' +
    'max-width:168px;height:20px;padding:0 4px;margin:0;border:none;' +
    'border-radius:4px;background:transparent;cursor:help;font-family:inherit;' +
    'font-size:13px;font-weight:700;line-height:16px;white-space:nowrap;' +
    `overflow:hidden;text-overflow:ellipsis;color:${color};`;
}

/** Flex-none wrapper so X's equal-width action slots don't stretch the badge. */
function mountInActionBar(actionBar: HTMLElement, badge: HTMLElement) {
  let slot = actionBar.querySelector<HTMLElement>(`:scope > [${DEBUG_SLOT_ATTR}]`);
  if (!slot) {
    slot = document.createElement('div');
    slot.setAttribute(DEBUG_SLOT_ATTR, 'true');
    slot.style.cssText =
      'display:flex;align-items:center;justify-content:flex-end;' +
      'flex:0 0 auto;min-width:0;align-self:center;padding:0 4px;';
    actionBar.appendChild(slot);
  }
  slot.appendChild(badge);
}

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
  const b = badge.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(b.right - el.offsetWidth, window.innerWidth - el.offsetWidth - 8),
  );
  el.style.left = `${left}px`;
  // Prefer below; flip above when the action bar sits near the viewport bottom.
  const below = b.bottom + 6;
  const tipH = el.offsetHeight || 40;
  el.style.top =
    below + tipH > window.innerHeight - 8
      ? `${Math.max(8, b.top - tipH - 6)}px`
      : `${below}px`;
}

function hideTip() {
  if (tipEl) tipEl.style.opacity = '0';
}

function extractId(node: HTMLElement): string {
  // The tweet's canonical permalink is the status link wrapping its timestamp.
  // Prefer it over the first `/status/` anchor, which may point at an embedded
  // quote tweet or reply link and can reorder between renders — an unstable id
  // would defeat the verdict cache and cause the post to be reclassified.
  const timeAnchor = node.querySelector('a[href*="/status/"] time')?.parentElement;
  const href =
    timeAnchor?.getAttribute('href') ??
    node.querySelector('a[href*="/status/"]')?.getAttribute('href') ??
    '';
  const m = href.match(/status\/(\d+)/);
  return m ? m[1] : '';
}

const CELL_SELECTOR = '[data-testid="cellInnerDiv"]';

/** The timeline cell wrapping a post node (or the node itself if none). */
function cellOf(node: HTMLElement): HTMLElement {
  return (node.closest<HTMLElement>(CELL_SELECTOR)) ?? node;
}

/** Lowercased @handle of the post in a node, or '' if none found. */
function handleOf(node: HTMLElement): string {
  const userName = node.querySelector('[data-testid="User-Name"]');
  const m = userName?.textContent?.match(/@(\w{1,15})/);
  return m ? m[1].toLowerCase() : '';
}

const articleIn = (cell: HTMLElement): HTMLElement | null =>
  cell.querySelector<HTMLElement>('article[data-testid="tweet"]');

export const xAdapter: PlatformAdapter = {
  name: 'x',

  findPosts(root) {
    return Array.from(root.querySelectorAll<HTMLElement>('article[data-testid="tweet"]'));
  },

  findThread(node) {
    // X renders a self-thread as consecutive timeline cells authored by the
    // same account. Walk siblings both ways collecting that same-author run.
    const cell = cellOf(node);
    const author = handleOf(node);
    if (!author || !cell.matches(CELL_SELECTOR)) return [node];

    const cells: HTMLElement[] = [cell];
    const sameAuthorArticle = (sib: Element | null): HTMLElement | null => {
      if (!(sib instanceof HTMLElement) || !sib.matches(CELL_SELECTOR)) return null;
      const art = articleIn(sib);
      return art && handleOf(art) === author ? art : null;
    };

    for (let p = cell.previousElementSibling; sameAuthorArticle(p); p = p!.previousElementSibling) {
      cells.unshift(p as HTMLElement);
    }
    for (let n = cell.nextElementSibling; sameAuthorArticle(n); n = n!.nextElementSibling) {
      cells.push(n as HTMLElement);
    }

    return cells.map(articleIn).filter((a): a is HTMLElement => a !== null);
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

    // Detach the debug badge before hiding children so we can remount it on
    // the placeholder (it usually lives inside the action bar).
    const badge = node.querySelector<HTMLElement>(`[${DEBUG_ATTR}]`);
    badge?.remove();

    for (const child of Array.from(node.children)) {
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

    const trailing = document.createElement('div');
    trailing.style.cssText = 'display:flex;align-items:center;gap:8px;flex:none;';

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

    trailing.append(btn);
    ph.append(label, trailing);
    node.appendChild(ph);

    // Remount an existing badge next to Show (annotate may also place a fresh one).
    if (badge) {
      styleBadge(badge, (badge.dataset.xffKind as DebugKind) || 'hidden');
      trailing.insertBefore(badge, btn);
    }
  },

  restore(node) {
    const badge = node.querySelector<HTMLElement>(`[${DEBUG_ATTR}]`);
    badge?.remove();

    node.querySelectorAll(`:scope > [${PLACEHOLDER_ATTR}]`).forEach((el) => el.remove());
    for (const child of Array.from(node.children)) {
      (child as HTMLElement).style.display = '';
    }
    delete node.dataset.xffCollapsed;
    node.dataset.xffRevealed = 'true';

    // Put the badge back on the action bar once the post is visible again.
    if (badge) {
      const kind = (badge.dataset.xffKind as DebugKind) || 'kept';
      styleBadge(badge, kind);
      const bar = findActionBar(node);
      if (bar) mountInActionBar(bar, badge);
      else node.appendChild(badge);
    }
  },

  annotate(node, label, kind, detail, confidence) {
    let badge = node.querySelector<HTMLElement>(`[${DEBUG_ATTR}]`);
    if (!badge) {
      badge = document.createElement('div');
      badge.setAttribute(DEBUG_ATTR, 'true');
      badge.setAttribute('role', 'status');
      badge.setAttribute('aria-label', 'Filter outcome');
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      badge.addEventListener('mouseenter', () => showTip(badge!, badge!.dataset.xffTip || ''));
      badge.addEventListener('mouseleave', hideTip);
    }

    badge.dataset.xffKind = kind;
    badge.dataset.xffTip = detail || label;
    badge.replaceChildren();

    const text = document.createElement('span');
    text.textContent = label;
    badge.appendChild(text);

    if (confidence != null && confidence > 0) {
      const conf = document.createElement('span');
      conf.textContent = `${Math.round(confidence)}%`;
      conf.style.cssText = 'margin-left:5px;font-weight:500;opacity:0.72;';
      badge.appendChild(conf);
    }

    styleBadge(badge, kind);

    const collapsed = node.dataset.xffCollapsed === 'true';
    const placeholder = node.querySelector<HTMLElement>(`:scope > [${PLACEHOLDER_ATTR}]`);
    const actionBar = findActionBar(node);

    if (collapsed && placeholder) {
      // Sit beside the Show control on the placeholder row.
      const trailing = placeholder.lastElementChild;
      if (trailing instanceof HTMLElement) {
        trailing.insertBefore(badge, trailing.firstChild);
      } else {
        placeholder.appendChild(badge);
      }
    } else if (actionBar) {
      mountInActionBar(actionBar, badge);
    } else {
      // Tweet chrome not ready yet — keep a discreet inline fallback.
      badge.style.position = 'absolute';
      badge.style.bottom = '8px';
      badge.style.right = '12px';
      badge.style.zIndex = '2';
      if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
      node.appendChild(badge);
    }
  },

  clearAnnotations(root) {
    root.querySelectorAll(`[${DEBUG_ATTR}]`).forEach((el) => el.remove());
    root.querySelectorAll(`[${DEBUG_SLOT_ATTR}]`).forEach((el) => el.remove());
    hideTip();
  },
};
