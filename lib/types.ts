// Shared types for the X Feed Filter extension.

/** User-configurable filter settings, persisted in extension storage. */
export interface FilterConfig {
  /** Master on/off switch for the whole extension. */
  enabled: boolean;
  /** Free-text natural-language rules, each judged by the LLM. */
  rules: string[];
  /** Preset category id -> enabled. Judged by the LLM. */
  categories: Record<string, boolean>;
  /** Author handles to hide deterministically (stored without a leading "@"). */
  blockedAuthors: string[];
  /** Show per-post debug badges (kept/hidden/blocked/…) on the feed. */
  debug: boolean;
}

/** A single post extracted from the page, sent to the background for judging. */
export interface PostData {
  id: string;
  author: string;
  text: string;
}

/** The classification result for a post. */
export interface Verdict {
  hide: boolean;
  reason: string;
}

/** Message sent from the content script to the background classifier. */
export interface ClassifyMessage {
  type: 'classify';
  post: PostData;
}

/**
 * Platform-agnostic contract every social platform implements. Only the
 * platform-specific DOM knowledge (selectors, collapse UI) lives behind this;
 * the engine that drives it is generic.
 */
export interface PlatformAdapter {
  name: string;
  /** Find candidate post nodes within a DOM subtree. */
  findPosts(root: ParentNode): HTMLElement[];
  /** Pull author + text out of a post node (null if it isn't a usable post). */
  extractPost(node: HTMLElement): PostData | null;
  /** Collapse a matched post into a thin placeholder with a reason + reveal. */
  collapse(node: HTMLElement, reason: string): void;
  /** Undo a collapse (the "Show anyway" action). */
  restore(node: HTMLElement): void;
  /**
   * Debug-only: stamp a post with its classification outcome. `label` is the
   * short pill text; `detail` is the full explanation shown on hover.
   */
  annotate(node: HTMLElement, label: string, kind: DebugKind, detail?: string): void;
  /** Remove all debug badges from a DOM subtree. */
  clearAnnotations(root: ParentNode): void;
}

/** Outcome shown by the debug badge on each post. */
export type DebugKind = 'pending' | 'kept' | 'hidden' | 'blocked' | 'skipped';
