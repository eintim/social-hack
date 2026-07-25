import type { DebugKind, PlatformAdapter } from '@/lib/types';

// All X-specific (and inherently brittle) DOM knowledge is confined here.

const PLACEHOLDER_ATTR = 'data-xff-placeholder';
const DEBUG_ATTR = 'data-xff-debug';
const DEBUG_SLOT_ATTR = 'data-xff-debug-slot';
const ER_ATTR = 'data-xff-er';
const ER_SLOT_ATTR = 'data-xff-er-slot';

/** X-native accent colors so the badge reads as part of the action row. */
const DEBUG_COLORS: Record<DebugKind, string> = {
  pending: 'rgb(255, 212, 0)',
  kept: 'rgb(0, 186, 124)',
  hidden: 'rgb(249, 24, 128)',
  blocked: 'rgb(120, 86, 255)',
  skipped: 'rgb(113, 118, 123)',
};

/** Extension brand accents — shared with the popup's signal palette. */
const ER_SIGNAL = '#e85d04';
const ER_SIGNAL_INK = '#fff7f0';
const ER_STEEL = 'rgb(113, 118, 123)';
const ER_STEEL_SOFT = 'rgba(113, 118, 123, 0.14)';
const ER_STEEL_LINE = 'rgba(113, 118, 123, 0.35)';

let erStylesInjected = false;

/** Once-per-page keyframes + base ER chip chrome. */
function ensureErStyles() {
  if (erStylesInjected || document.getElementById('xff-er-styles')) {
    erStylesInjected = true;
    return;
  }
  const style = document.createElement('style');
  style.id = 'xff-er-styles';
  style.textContent = `
    @keyframes xff-er-in {
      from { opacity: 0; transform: translateY(3px) scale(0.96); }
      to   { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes xff-er-hot-glow {
      0%, 100% { box-shadow: 0 0 0 0 rgba(232, 93, 4, 0); }
      40%      { box-shadow: 0 0 0 3px rgba(232, 93, 4, 0.28); }
    }
    [data-xff-er] {
      box-sizing: border-box;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      height: 22px;
      max-width: 120px;
      margin: 0;
      padding: 0 8px 0 0;
      border: 1px solid ${ER_STEEL_LINE};
      border-radius: 3px;
      background: ${ER_STEEL_SOFT};
      color: ${ER_STEEL};
      cursor: help;
      font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 12px;
      font-weight: 600;
      line-height: 1;
      letter-spacing: 0.01em;
      white-space: nowrap;
      overflow: hidden;
      vertical-align: middle;
      animation: xff-er-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both;
    }
    [data-xff-er]::before {
      content: "";
      align-self: stretch;
      width: 3px;
      flex: none;
      background: ${ER_STEEL};
      opacity: 0.55;
    }
    [data-xff-er][data-xff-er-high="true"] {
      border-color: transparent;
      background: ${ER_SIGNAL};
      color: ${ER_SIGNAL_INK};
      animation:
        xff-er-in 220ms cubic-bezier(0.22, 1, 0.36, 1) both,
        xff-er-hot-glow 1.1s ease-out 180ms 1;
    }
    [data-xff-er][data-xff-er-high="true"]::before {
      background: ${ER_SIGNAL_INK};
      opacity: 0.85;
    }
    [data-xff-er] [data-xff-er-kicker] {
      font-family: "Arial Narrow", "Helvetica Neue", ui-sans-serif, system-ui, sans-serif;
      font-size: 9px;
      font-weight: 800;
      font-stretch: condensed;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      opacity: 0.78;
      padding-left: 7px;
    }
    [data-xff-er][data-xff-er-high="true"] [data-xff-er-kicker] {
      opacity: 1;
    }
    [data-xff-er] [data-xff-er-value] {
      font-variant-numeric: tabular-nums;
      font-weight: 700;
      font-size: 12px;
      letter-spacing: -0.02em;
      padding-right: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      [data-xff-er],
      [data-xff-er][data-xff-er-high="true"] {
        animation: none;
      }
    }
  `;
  document.documentElement.appendChild(style);
  erStylesInjected = true;
}

/** Build / refresh the ER chip's inner label structure. */
function paintErBadge(badge: HTMLElement, ratePct: number, high: boolean, detail: string) {
  ensureErStyles();

  const rounded =
    ratePct >= 10 ? ratePct.toFixed(0) : ratePct >= 1 ? ratePct.toFixed(1) : ratePct.toFixed(2);

  badge.dataset.xffTip = detail;
  badge.dataset.xffErHigh = high ? 'true' : 'false';
  badge.setAttribute('aria-label', high ? `Hot engagement ${rounded}%` : `Engagement rate ${rounded}%`);
  badge.replaceChildren();

  const kicker = document.createElement('span');
  kicker.setAttribute('data-xff-er-kicker', 'true');
  kicker.textContent = high ? 'Hot' : 'ER';

  const value = document.createElement('span');
  value.setAttribute('data-xff-er-value', 'true');
  value.textContent = `${rounded}%`;

  badge.append(kicker, value);
}

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
function mountInActionBar(
  actionBar: HTMLElement,
  badge: HTMLElement,
  slotAttr: string = DEBUG_SLOT_ATTR,
) {
  let slot = actionBar.querySelector<HTMLElement>(`:scope > [${slotAttr}]`);
  if (!slot) {
    slot = document.createElement('div');
    slot.setAttribute(slotAttr, 'true');
    slot.style.cssText =
      'display:flex;align-items:center;justify-content:flex-end;' +
      'flex:0 0 auto;min-width:0;align-self:center;padding:0 4px;';
    actionBar.appendChild(slot);
  }
  slot.appendChild(badge);
}

/** Parse abbreviated counts like "1.2K", "3.4M", or "1,234". */
function parseCount(raw: string): number {
  const s = raw.replace(/,/g, '').trim().toUpperCase();
  if (!s) return 0;
  const m = s.match(/^([\d.]+)\s*([KMB])?$/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n)) return 0;
  const mult = m[2] === 'K' ? 1e3 : m[2] === 'M' ? 1e6 : m[2] === 'B' ? 1e9 : 1;
  return Math.round(n * mult);
}

/**
 * Pull a numeric count from an action button. Prefers aria-label ("123 Likes",
 * "1.2K views") then falls back to visible text inside the control.
 */
function countFromControl(el: Element | null): number {
  if (!el) return 0;
  // Prefer the element's own aria-label; some counts live on a child/parent.
  const labels = [
    el.getAttribute('aria-label'),
    ...Array.from(el.querySelectorAll('[aria-label]')).map((n) => n.getAttribute('aria-label')),
    el.parentElement?.getAttribute('aria-label'),
  ].filter((s): s is string => !!s);

  for (const aria of labels) {
    // "7656 Likes. Like", "14.5K views. View post analytics", "1204 reposts. Repost"
    const m =
      aria.match(/([\d.,]+)\s*([KMB])?\s*(?:views?|likes?|replies|reposts?|retweets?)/i) ??
      aria.match(/([\d.,]+)\s*([KMB])?/i);
    if (m) {
      const n = parseCount(`${m[1]}${m[2] ?? ''}`);
      if (n > 0 || /^0\b/.test(m[1])) return n;
    }
  }
  // Visible count spans often sit next to the icon.
  for (const span of el.querySelectorAll('span')) {
    const t = (span.textContent ?? '').trim();
    if (/^[\d.,]+\s*[KMB]?$/i.test(t)) return parseCount(t);
  }
  return 0;
}

/** True when a control lives inside a quoted/nested tweet, not this article. */
function isNestedControl(article: HTMLElement, el: Element): boolean {
  const nested = el.closest('article[data-testid="tweet"], [data-testid="quoteTweet"]');
  return !!(nested && nested !== article);
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
  // ER tips use " · " separators — render as a stacked readout.
  if (badge.hasAttribute(ER_ATTR) && text.includes(' · ')) {
    el.replaceChildren();
    const standout = badge.dataset.xffErStandout || '';
    const lines = text.split(' → ');
    const counts = (lines[0] ?? '').split(' · ');
    const grid = document.createElement('div');
    grid.style.cssText =
      'display:grid;grid-template-columns:auto auto;gap:2px 10px;font-variant-numeric:tabular-nums;';
    for (const part of counts) {
      const m = part.trim().match(/^(\S+)\s+(.+)$/);
      if (!m) continue;
      // The disproportionately-high metric (e.g. a ratio'd reply count) is
      // painted in the signal accent so it reads at a glance.
      const hot = standout !== '' && m[2] === standout;
      const n = document.createElement('span');
      n.textContent = hot ? `${m[1]} ▲` : m[1];
      n.style.fontWeight = hot ? '800' : '700';
      n.style.color = hot ? ER_SIGNAL : 'rgb(231,233,234)';
      const l = document.createElement('span');
      l.textContent = m[2];
      l.style.color = hot ? ER_SIGNAL : 'rgb(113,118,123)';
      l.style.fontWeight = hot ? '700' : '400';
      grid.append(n, l);
    }
    el.appendChild(grid);
    if (lines[1]) {
      const rate = document.createElement('div');
      rate.textContent = lines[1].trim();
      rate.style.cssText =
        'margin-top:8px;padding-top:8px;border-top:1px solid rgb(47,51,54);' +
        'font-weight:700;font-variant-numeric:tabular-nums;color:rgb(232,93,4);';
      el.appendChild(rate);
    }
  } else {
    el.textContent = text;
  }
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

  extractMetrics(node) {
    const pick = (...sels: string[]): Element | null => {
      for (const sel of sels) {
        for (const el of node.querySelectorAll(sel)) {
          if (!isNestedControl(node, el)) return el;
        }
      }
      return null;
    };

    // Liked/reposted posts flip testid to unlike/unretweet.
    const replies = countFromControl(pick('[data-testid="reply"]'));
    const reposts = countFromControl(pick('[data-testid="retweet"]', '[data-testid="unretweet"]'));
    const likes = countFromControl(pick('[data-testid="like"]', '[data-testid="unlike"]'));

    // Views live on the analytics link (or a sibling control labeled "views").
    let views = 0;
    const viewCandidates: Element[] = [];
    for (const a of node.querySelectorAll('a[href*="/analytics"]')) {
      if (!isNestedControl(node, a)) viewCandidates.push(a);
    }
    for (const el of node.querySelectorAll('[aria-label]')) {
      if (isNestedControl(node, el)) continue;
      const label = el.getAttribute('aria-label') ?? '';
      if (/\bviews?\b/i.test(label) && !/\b(like|reply|repost|retweet|bookmark)\b/i.test(label)) {
        viewCandidates.push(el);
      }
    }
    for (const el of viewCandidates) {
      views = countFromControl(el);
      if (views > 0) break;
    }
    // Last resort: abbreviated count text next to the analytics link.
    if (views === 0) {
      for (const a of viewCandidates) {
        for (const span of a.querySelectorAll('span')) {
          const t = (span.textContent ?? '').trim();
          if (/^[\d.,]+\s*[KMB]?$/i.test(t)) {
            views = parseCount(t);
            if (views > 0) break;
          }
        }
        if (views > 0) break;
      }
    }
    // Action-bar fallback: the views control is usually the only remaining
    // numbered slot that isn't reply/repost/like/bookmark.
    if (views === 0) {
      const bar = findActionBar(node);
      if (bar) {
        for (const child of Array.from(bar.children)) {
          if (
            child.querySelector(
              '[data-testid="reply"],[data-testid="retweet"],[data-testid="unretweet"],' +
                '[data-testid="like"],[data-testid="unlike"],[data-testid="bookmark"],' +
                '[data-testid="removeBookmark"],[data-xff-debug],[data-xff-er],' +
                `[${DEBUG_SLOT_ATTR}],[${ER_SLOT_ATTR}]`,
            )
          ) {
            continue;
          }
          const n = countFromControl(child);
          if (n > 0) {
            views = n;
            break;
          }
          for (const span of child.querySelectorAll('span')) {
            const t = (span.textContent ?? '').trim();
            if (/^[\d.,]+\s*[KMB]?$/i.test(t)) {
              views = parseCount(t);
              if (views > 0) break;
            }
          }
          if (views > 0) break;
        }
      }
    }

    return { replies, reposts, likes, views };
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
    const erBadge = node.querySelector<HTMLElement>(`[${ER_ATTR}]`);
    erBadge?.remove();

    node.querySelectorAll(`:scope > [${PLACEHOLDER_ATTR}]`).forEach((el) => el.remove());
    for (const child of Array.from(node.children)) {
      (child as HTMLElement).style.display = '';
    }
    delete node.dataset.xffCollapsed;
    node.dataset.xffRevealed = 'true';

    // Put the badge back on the action bar once the post is visible again.
    const bar = findActionBar(node);
    if (badge) {
      const kind = (badge.dataset.xffKind as DebugKind) || 'kept';
      styleBadge(badge, kind);
      if (bar) mountInActionBar(bar, badge);
      else node.appendChild(badge);
    }
    if (erBadge) {
      if (bar) mountInActionBar(bar, erBadge, ER_SLOT_ATTR);
      else node.appendChild(erBadge);
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

  annotateEngagement(node, ratePct, high, detail, standout) {
    let badge = node.querySelector<HTMLElement>(`[${ER_ATTR}]`);
    const isNew = !badge;
    if (!badge) {
      badge = document.createElement('div');
      badge.setAttribute(ER_ATTR, 'true');
      badge.setAttribute('role', 'status');
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      badge.addEventListener('mouseenter', () => showTip(badge!, badge!.dataset.xffTip || ''));
      badge.addEventListener('mouseleave', hideTip);
    }

    badge.dataset.xffErStandout = standout ?? '';
    paintErBadge(badge, ratePct, high, detail);
    // Re-trigger enter animation only when the chip is first mounted or flips Hot.
    if (!isNew && high && badge.dataset.xffErAnimated !== 'hot') {
      badge.style.animation = 'none';
      // Force reflow so the hot glow can replay.
      void badge.offsetWidth;
      badge.style.animation = '';
    }
    if (high) badge.dataset.xffErAnimated = 'hot';
    else delete badge.dataset.xffErAnimated;

    const collapsed = node.dataset.xffCollapsed === 'true';
    const placeholder = node.querySelector<HTMLElement>(`:scope > [${PLACEHOLDER_ATTR}]`);
    const actionBar = findActionBar(node);

    if (collapsed && placeholder) {
      const trailing = placeholder.lastElementChild;
      if (trailing instanceof HTMLElement) {
        trailing.insertBefore(badge, trailing.firstChild);
      } else {
        placeholder.appendChild(badge);
      }
    } else if (actionBar) {
      mountInActionBar(actionBar, badge, ER_SLOT_ATTR);
    } else {
      badge.style.position = 'absolute';
      badge.style.bottom = '8px';
      badge.style.right = '12px';
      badge.style.zIndex = '2';
      if (getComputedStyle(node).position === 'static') node.style.position = 'relative';
      node.appendChild(badge);
    }
  },

  clearEngagement(root) {
    root.querySelectorAll(`[${ER_ATTR}]`).forEach((el) => el.remove());
    root.querySelectorAll(`[${ER_SLOT_ATTR}]`).forEach((el) => el.remove());
    hideTip();
  },
};
