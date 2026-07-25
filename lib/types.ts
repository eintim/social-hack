// Shared types for the X Feed Filter extension.

/** Which backend classifies posts. */
export type Provider = 'on-device' | 'openai';

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
  /** Show engagement-rate badges on posts (likes+replies+reposts ÷ views). */
  showEngagement: boolean;
  /** ER % at or above which a post is marked "Hot". */
  engagementHighPct: number;
  /** Hide posts whose engagement rate is below hideLowEngagementPct. */
  hideLowEngagement: boolean;
  /** Minimum ER %; posts below this are hidden when hideLowEngagement is on. */
  hideLowEngagementPct: number;
  /** Which classifier backend to use. */
  provider: Provider;
  /** OpenAI-compatible base URL, e.g. https://api.openai.com/v1 (we append /chat/completions). */
  apiBaseUrl: string;
  /** API key for the OpenAI-compatible endpoint (stored unencrypted in local storage). */
  apiKey: string;
  /** Model name for the OpenAI-compatible endpoint, e.g. gpt-4o-mini. */
  apiModel: string;
}

/** A single post extracted from the page, sent to the background for judging. */
export interface PostData {
  id: string;
  author: string;
  text: string;
}

/** Engagement counts scraped from a post's action bar. */
export interface PostMetrics {
  replies: number;
  reposts: number;
  likes: number;
  /** Absent or 0 when X hasn't rendered view counts yet. */
  views: number;
}

/** The classification result for a post. */
export interface Verdict {
  hide: boolean;
  reason: string;
  /** Model confidence in the decision, 0–100. */
  confidence: number;
}

/** Message sent from the content script to the background classifier. */
export interface ClassifyMessage {
  type: 'classifyBatch';
  posts: PostData[];
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
  /**
   * Return every post node belonging to the same thread as `node` (including
   * `node` itself), in document order. For a standalone post this is just
   * `[node]`. Used so hiding one post in a thread hides the whole thread.
   */
  findThread(node: HTMLElement): HTMLElement[];
  /** Pull author + text out of a post node (null if it isn't a usable post). */
  extractPost(node: HTMLElement): PostData | null;
  /** Pull reply/repost/like/view counts from a post's action bar. */
  extractMetrics(node: HTMLElement): PostMetrics | null;
  /** Collapse a matched post into a thin placeholder with a reason + reveal. */
  collapse(node: HTMLElement, reason: string): void;
  /** Undo a collapse (the "Show anyway" action). */
  restore(node: HTMLElement): void;
  /**
   * Debug-only: stamp a post with its classification outcome. `label` is the
   * short pill text; `detail` is the full explanation shown on hover.
   * `confidence` (0–100) is shown beside the label when the model provided one.
   */
  annotate(
    node: HTMLElement,
    label: string,
    kind: DebugKind,
    detail?: string,
    confidence?: number,
  ): void;
  /** Remove all debug badges from a DOM subtree. */
  clearAnnotations(root: ParentNode): void;
  /**
   * Stamp a post with its engagement rate. `ratePct` is (likes+replies+reposts)/views×100;
   * `high` switches to the Hot styling when at/above the user threshold.
   */
  annotateEngagement(node: HTMLElement, ratePct: number, high: boolean, detail: string): void;
  /** Remove all engagement-rate badges from a DOM subtree. */
  clearEngagement(root: ParentNode): void;
}

/** Outcome shown by the debug badge on each post. */
export type DebugKind = 'pending' | 'kept' | 'hidden' | 'blocked' | 'skipped';
