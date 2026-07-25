# Feed Filter — an on-device AI feed filter for X

**Built at the Cursor Hackathon, Stuttgart — July 2026**

Feed Filter is a Chrome extension that reads your X (Twitter) timeline as it renders and hides the posts you don't want to see — ragebait, ads, engagement bait, whole topics, specific accounts — using an LLM that runs **entirely on your device**, with zero servers, zero API costs, and zero data leaving the browser. Point it at an OpenAI-compatible endpoint instead if you want a stronger model.

![The X timeline with Feed Filter active — matched posts collapse in place, kept posts get a keep/hide badge and an engagement-rate chip](docs/screenshots/x-timeline.png)

## Table of contents

- [The problem](#the-problem)
- [The solution](#the-solution)
- [Features](#features)
- [How it works](#how-it-works)
- [Getting started](#getting-started)
- [Using it](#using-it)
- [Tech stack](#tech-stack)
- [Limitations & roadmap](#limitations--roadmap)

## The problem

If you create content, X is a research tool, a distribution channel, and a networking tool all at once — which means you can't just log off. But the same timeline that shows you what's working in your niche also buries you in outrage bait, crypto shills, engagement-farming reply-guy threads, and ads dressed up as posts. Every minute spent scrolling past that is a minute not spent writing, filming, or replying to the people who actually matter to your audience.

Existing "mute this word" tools are keyword-matching and miss anything phrased differently. Server-side moderation tools require you to hand your feed (and your account) to a third-party API. Neither lets you say, in plain language, *"hide AI hype threads"* or *"hide anything that's obviously an ad"* and have it actually work.

## The solution

Feed Filter sits in the browser, watches the timeline as X renders it, and asks a language model one question per post: *does this match anything you've told me to hide?* Matches collapse into a single flat line with a reason and a "Show" link — the rest of the thread goes with it, so a hidden reply doesn't leave orphaned context behind. Everything else stays exactly as X rendered it, with an optional engagement-rate badge so you can see what's actually resonating versus what's just loud.

Because the classifier can run **on-device** (Chrome's built-in Gemini Nano), this works with no account, no API key, no per-request cost, and no post content ever leaving your machine. Flip a switch in the popup and the same pipeline runs against any OpenAI-compatible endpoint instead, for when you want a stronger model or don't have on-device AI available.

## Features

### Topic & rule-based filtering
Ten preset categories (AI, Tech, Gaming, Ads/promotions, Crypto/NFT, Politics, Rage/outrage bait, Engagement bait, Sports, Crime/violence) you toggle with one click, plus unlimited custom rules in plain language — `"AI hype threads"`, `"threads about layoffs"` — judged by the same model, no regex required.

### Author blocking
Deterministic, no LLM round-trip: block a handle once and every post from that account collapses instantly, forever.

### Engagement-rate awareness
Every post gets an (likes + replies + reposts) ÷ views badge. Posts at or above your threshold get a **Hot** badge — useful signal for a creator sizing up what's actually working. Optionally hide everything *below* a floor, deterministically, no model call needed.

### Thread-aware hiding
X renders self-threads as consecutive timeline cells. Hiding one post in a thread hides the whole thread — and late-arriving siblings (X virtualizes the timeline, so replies can stream in after the parent) inherit the hide instead of flashing back into view.

### Two classifier backends, one interface
- **On-device (default):** Chrome's built-in Gemini Nano via the Prompt API. Free, private, works offline once downloaded.
- **API mode:** any OpenAI-compatible `/chat/completions` endpoint — bring your own key and model.

Both paths share one system prompt builder, one JSON verdict schema, and one batching/caching engine — swapping providers is a toggle, not a rewrite.

### Debug mode
Every post gets a small badge — `✓ kept`, `✕ <reason>`, `⛔ blocked @handle`, `… classifying` — with confidence %, and a hover tooltip with the model's full reasoning. Built for demoing the "why" live.

### Fail-open by design
Classifier error, timeout, missing API key, model not downloaded yet — the post stays visible. The extension can only ever *hide less* than intended, never silently over-hide.

### Popup control panel
A tabbed settings panel (Topics / Rules / Authors / Engagement / Classifier) that fits without scrolling, with live status badges per tab (active filter counts, on-device model readiness, API connection state).

| Topics | Engagement | Classifier |
|---|---|---|
| ![Topics tab](docs/screenshots/popup-topics.png) | ![Engagement tab](docs/screenshots/popup-engagement.png) | ![Classifier tab](docs/screenshots/popup-classifier.png) |

## How it works

```
entrypoints/x.content.ts   → runs on x.com / twitter.com, boots the engine
lib/engine.ts               → platform-agnostic scan/classify/cache loop
lib/adapters/x.ts            → all X-specific DOM knowledge (selectors, collapse UI)
entrypoints/background.ts   → owns the classifier queue (serialized on-device,
                               concurrency-capped for API mode)
lib/classifier/
  ├─ onDevice.ts             → Chrome Prompt API (Gemini Nano), persistent session
  ├─ openai.ts                → any OpenAI-compatible /chat/completions endpoint
  └─ parse.ts                 → shared JSON verdict parsing, fail-open on any error
lib/prompt.ts                → one system prompt + batch schema for both providers
entrypoints/popup/            → React settings UI, WXT + Vite
```

A `MutationObserver` on `document.body` re-scans on every DOM change. For each post: check the author blocklist and the low-engagement floor locally (no LLM), check the in-memory verdict cache keyed by the post's stable status-link id (not the DOM node — X recycles nodes as you scroll), and only if neither resolves it, queue the post into an 8-post batch that flushes on a short debounce. One batched inference judges the whole batch against every active category/rule at once, returning `{hide, reason, confidence}` per post. On-device batches are strictly serialized (Gemini Nano is single-model); API-mode batches run with up to 4 concurrent in flight.

## Getting started

Requires **Chrome 138+** with the experimental Prompt API for on-device mode (API mode works on any Chromium-based browser).

```bash
pnpm install
pnpm dev
```

`pnpm dev` seeds the required `chrome://flags` (`#prompt-api-for-gemini-nano`, `#optimization-guide-on-device-model`) into a dedicated WXT-managed Chrome profile and launches it with the extension loaded — no manual flag-flipping needed. First run: open the popup and click **Download** under the Classifier tab to fetch Gemini Nano (one-time, a few hundred MB).

```bash
pnpm build        # production build → .output/chrome-mv3
pnpm compile       # typecheck only
```

To load a production build manually instead: `chrome://extensions` → enable Developer mode → **Load unpacked** → select `.output/chrome-mv3`.

## Using it

1. Open the popup and flip the header switch to **Live**.
2. **Topics** — toggle any preset categories you want scrubbed.
3. **Rules** — add plain-language rules for anything the presets don't cover.
4. **Authors** — block specific handles outright.
5. **Engagement** — turn on rate badges, tune the Hot threshold, optionally hide low-engagement posts.
6. **Classifier** — stick with On-device, or switch to API and enter a base URL, key, and model.
7. Turn on **Debug labels** (bottom of the popup) to see every post's verdict and confidence live on the timeline while you demo.

## Tech stack

- [WXT](https://wxt.dev/) — Manifest V3 extension framework (Vite-powered, cross-browser)
- React 19 + TypeScript
- Chrome built-in AI — `LanguageModel` Prompt API (Gemini Nano), structured JSON output
- Any OpenAI-compatible `/chat/completions` API as a swappable second provider
- No backend, no database, no telemetry — `browser.storage.local` is the only persistence

## Limitations & roadmap

- X's DOM is unversioned and can change under us — all of that fragility is deliberately isolated in `lib/adapters/x.ts` so a selector fix never touches the engine.
- On-device mode is Chrome-only and requires an experimental flag + a one-time model download.
- API mode sends full post text (author + body, never your account/session) to whatever endpoint you configure — the popup states this explicitly before you enter a key.
- Only X/Twitter has an adapter today; the engine and popup are already platform-agnostic (`PlatformAdapter` interface), so a second platform is mostly a new adapter file.
- No cross-device sync of your rules/blocklist yet — storage is local to the browser profile.
