import { useEffect, useState } from 'react';
import { filterConfig, normalizeConfig } from '@/lib/storage';
import { CATEGORIES } from '@/lib/categories';
import type { FilterConfig, Provider } from '@/lib/types';
import './App.css';

type ModelState = 'checking' | 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'ready';
type ApiTestState = 'idle' | 'testing' | 'ok' | 'error';
type Tab = 'topics' | 'rules' | 'authors' | 'engagement' | 'model';

const EXPECTED = [{ type: 'text' as const, languages: ['en'] }];

const TABS: { id: Tab; label: string }[] = [
  { id: 'topics', label: 'Topics' },
  { id: 'rules', label: 'Rules' },
  { id: 'authors', label: 'Authors' },
  { id: 'engagement', label: 'Engagement' },
  { id: 'model', label: 'Classifier' },
];

/** Fill in provider fields missing from older stored configs. */
function withDefaults(c: FilterConfig): FilterConfig {
  return normalizeConfig(c);
}

function normalizeAvailability(value: string): ModelState {
  if (value === 'available' || value === 'readily') return 'ready';
  if (value === 'downloadable' || value === 'after-download') return 'downloadable';
  if (value === 'downloading') return 'downloading';
  return 'unavailable';
}

/** Ask Chrome for host access to an OpenAI-compatible base URL. */
async function ensureHostPermission(baseUrl: string): Promise<boolean> {
  try {
    const origin = new URL(baseUrl).origin;
    const origins = [`${origin}/*`];
    const already = await browser.permissions.contains({ origins });
    if (already) return true;
    return await browser.permissions.request({ origins });
  } catch {
    return false;
  }
}

/** Status dot color for the on-device model, independent of the banner it's normally nested in. */
function modelDotColor(model: ModelState): string {
  if (model === 'ready') return 'var(--ok)';
  if (model === 'unavailable' || model === 'unsupported') return 'var(--warn)';
  if (model === 'checking') return 'var(--muted)';
  return 'var(--signal)';
}

function apiDotColor(state: ApiTestState): string {
  if (state === 'ok') return 'var(--ok)';
  if (state === 'error') return 'var(--warn)';
  if (state === 'testing') return 'var(--signal)';
  return 'var(--muted)';
}

function App() {
  const [config, setConfig] = useState<FilterConfig | null>(null);
  const [tab, setTab] = useState<Tab>('topics');
  const [model, setModel] = useState<ModelState>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [newRule, setNewRule] = useState('');
  const [newAuthor, setNewAuthor] = useState('');
  const [apiTest, setApiTest] = useState<ApiTestState>('idle');
  const [apiError, setApiError] = useState('');

  useEffect(() => {
    filterConfig.getValue().then((c) => {
      const next = withDefaults(c);
      setConfig(next);
      // Persist newly added fields for older installs.
      if (
        c.showEngagement === undefined ||
        c.engagementHighPct === undefined ||
        c.hideLowEngagement === undefined ||
        c.hideLowEngagementPct === undefined
      ) {
        void filterConfig.setValue(next);
      }
    });
    checkModel();
    // Poll so the indicator updates live (downloadable → downloading → ready)
    // even when the download was triggered outside the popup.
    const id = setInterval(checkModel, 2000);
    return () => clearInterval(id);
  }, []);

  async function checkModel() {
    if (typeof LanguageModel === 'undefined') {
      setModel('unsupported');
      return;
    }
    try {
      setModel(
        normalizeAvailability(
          await LanguageModel.availability({ expectedInputs: EXPECTED, expectedOutputs: EXPECTED }),
        ),
      );
    } catch {
      setModel('unsupported');
    }
  }

  async function downloadModel() {
    if (typeof LanguageModel === 'undefined') return;
    setProgress(0);
    setModel('downloading');
    try {
      const session = await LanguageModel.create({
        expectedInputs: EXPECTED,
        expectedOutputs: EXPECTED,
        monitor(m) {
          m.addEventListener('downloadprogress', (e) => {
            setProgress((e as ProgressEvent).loaded);
          });
        },
      });
      session.destroy();
    } catch {
      // fall through to re-check below
    }
    setProgress(null);
    checkModel();
  }

  function update(patch: Partial<FilterConfig>) {
    if (!config) return;
    const next = { ...config, ...patch };
    setConfig(next);
    filterConfig.setValue(next);
  }

  async function setProvider(provider: Provider) {
    update({ provider });
    setApiTest('idle');
    setApiError('');
  }

  async function setApiBaseUrl(apiBaseUrl: string) {
    if (!config) return;
    const next = { ...config, apiBaseUrl };
    setConfig(next);
    // Persist immediately so typing isn't lost, but request host permission
    // once the URL looks like a real origin (on blur / via test).
    filterConfig.setValue(next);
    setApiTest('idle');
  }

  async function commitApiBaseUrl() {
    if (!config) return;
    const url = config.apiBaseUrl.trim();
    if (!url) return;
    const ok = await ensureHostPermission(url);
    if (!ok) {
      setApiError('Host permission denied — API mode needs access to this endpoint.');
      setApiTest('error');
      return;
    }
    setApiError('');
  }

  async function testApi() {
    if (!config) return;
    const base = config.apiBaseUrl.trim();
    const key = config.apiKey.trim();
    const modelName = config.apiModel.trim();
    if (!base || !key || !modelName) {
      setApiError('Fill in base URL, API key, and model first.');
      setApiTest('error');
      return;
    }
    const granted = await ensureHostPermission(base);
    if (!granted) {
      setApiError('Host permission denied — cannot reach this endpoint.');
      setApiTest('error');
      return;
    }
    setApiTest('testing');
    setApiError('');
    try {
      const origin = base.replace(/\/+$/, '');
      const res = await fetch(`${origin}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: 'system', content: 'Reply with JSON only.' },
            {
              role: 'user',
              content:
                'Classify this dummy post. Return {"results":[{"index":1,"hide":false,"reason":"ok","confidence":100}]}.\n\nPost 1 (@test):\n"""hello"""',
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
          max_tokens: 80,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`${res.status}: ${body.slice(0, 120)}`);
      }
      setApiTest('ok');
    } catch (err) {
      setApiTest('error');
      setApiError(err instanceof Error ? err.message : 'Request failed');
    }
  }

  function addRule() {
    const r = newRule.trim();
    if (!config || !r) return;
    update({ rules: [...config.rules, r] });
    setNewRule('');
  }

  function addAuthor() {
    const a = newAuthor.trim().replace(/^@+/, '');
    if (!config || !a) return;
    if (config.blockedAuthors.some((h) => h.toLowerCase() === a.toLowerCase())) {
      setNewAuthor('');
      return;
    }
    update({ blockedAuthors: [...config.blockedAuthors, a] });
    setNewAuthor('');
  }

  if (!config) return <div className="app app-loading">Loading…</div>;

  const provider = config.provider ?? 'on-device';
  const activeCats = CATEGORIES.filter((c) => config.categories[c.id]).length;
  const activeEngagement = Number(config.showEngagement) + Number(config.hideLowEngagement);

  function navBadge(id: Tab) {
    if (id === 'topics') return <span className="navtab-count">{activeCats}/{CATEGORIES.length}</span>;
    if (id === 'rules') return <span className="navtab-count">{config!.rules.length}</span>;
    if (id === 'authors') return <span className="navtab-count">{config!.blockedAuthors.length}</span>;
    if (id === 'engagement') return <span className="navtab-count">{activeEngagement}/2</span>;
    if (id === 'model') {
      const color = provider === 'on-device' ? modelDotColor(model) : apiDotColor(apiTest);
      return <span className="navtab-dot" style={{ background: color }} aria-hidden="true" />;
    }
    return null;
  }

  return (
    <div className={`app${config.enabled ? ' app-live' : ''}`}>
      <header className="header">
        <div className="brand">
          <span className="brand-mark">X · local filter</span>
          <h1>Feed Filter</h1>
        </div>
        <label className="switch header-switch">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            aria-label={config.enabled ? 'Filtering on' : 'Filtering off'}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="switch-label">{config.enabled ? 'Live' : 'Off'}</span>
        </label>
      </header>
      <p className="tagline">
        {config.enabled
          ? 'Cutting noise from your timeline as you scroll.'
          : 'Turn on to start cutting noise from your timeline.'}
      </p>

      <div className="shell">
        <nav className="rail" role="tablist" aria-label="Settings sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={tab === t.id}
              aria-controls={`panel-${t.id}`}
              className={tab === t.id ? 'navtab navtab-on' : 'navtab'}
              onClick={() => setTab(t.id)}
            >
              <span className="navtab-label">{t.label}</span>
              {navBadge(t.id)}
            </button>
          ))}
        </nav>

        <div className="panel">
          {tab === 'topics' && (
            <div className="panel-pane" role="tabpanel" id="panel-topics" aria-labelledby="tab-topics">
              <div className="panel-head">
                <h2>Redact topics</h2>
                <p className="panel-desc">Pick what the model should scrub from your timeline.</p>
              </div>
              <div className="chips" role="group" aria-label="Topics to hide">
                {CATEGORIES.map((cat) => {
                  const active = !!config.categories[cat.id];
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      className={active ? 'chip chip-on' : 'chip'}
                      title={cat.description}
                      aria-pressed={active}
                      onClick={() => update({ categories: { ...config.categories, [cat.id]: !active } })}
                    >
                      <span className="chip-label">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {tab === 'rules' && (
            <div className="panel-pane" role="tabpanel" id="panel-rules" aria-labelledby="tab-rules">
              <div className="panel-head">
                <h2>Custom rules</h2>
                <p className="panel-desc">Plain-language rules the model judges each post against.</p>
              </div>
              <div className="row">
                <input
                  value={newRule}
                  placeholder="e.g. AI hype threads"
                  onChange={(e) => setNewRule(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addRule()}
                />
                <button type="button" className="add" onClick={addRule}>
                  Add
                </button>
              </div>
              <ul className="list list-scroll">
                {config.rules.map((rule, i) => (
                  <li key={`${rule}-${i}`}>
                    <span>{rule}</span>
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Remove rule: ${rule}`}
                      onClick={() => update({ rules: config.rules.filter((_, j) => j !== i) })}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {config.rules.length === 0 && (
                  <li className="empty">Write a rule in plain language to hide matching posts.</li>
                )}
              </ul>
            </div>
          )}

          {tab === 'authors' && (
            <div className="panel-pane" role="tabpanel" id="panel-authors" aria-labelledby="tab-authors">
              <div className="panel-head">
                <h2>Blocked authors</h2>
                <p className="panel-desc">Hidden deterministically — no model needed.</p>
              </div>
              <div className="row">
                <input
                  value={newAuthor}
                  placeholder="@handle"
                  onChange={(e) => setNewAuthor(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addAuthor()}
                />
                <button type="button" className="add" onClick={addAuthor}>
                  Add
                </button>
              </div>
              <ul className="list list-scroll">
                {config.blockedAuthors.map((h, i) => (
                  <li key={h}>
                    <span>@{h}</span>
                    <button
                      type="button"
                      className="remove"
                      aria-label={`Unblock @${h}`}
                      onClick={() => update({ blockedAuthors: config.blockedAuthors.filter((_, j) => j !== i) })}
                    >
                      ×
                    </button>
                  </li>
                ))}
                {config.blockedAuthors.length === 0 && (
                  <li className="empty">Add a handle to hide every post from that account.</li>
                )}
              </ul>
            </div>
          )}

          {tab === 'engagement' && (
            <div className="panel-pane" role="tabpanel" id="panel-engagement" aria-labelledby="tab-engagement">
              <div className="panel-head">
                <h2>Engagement</h2>
                <p className="panel-desc">(likes + replies + reposts) ÷ views.</p>
              </div>
              <div className="footer-toggle engagement-toggle">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={config.showEngagement}
                    onChange={(e) => update({ showEngagement: e.target.checked })}
                    aria-label="Show engagement rates"
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                  <span className="switch-label">Show engagement rates</span>
                </label>
              </div>
              <label className={`field${config.showEngagement ? '' : ' field-disabled'}`}>
                <span className="field-label">High threshold %</span>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  disabled={!config.showEngagement}
                  value={config.engagementHighPct}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    update({ engagementHighPct: n });
                  }}
                />
              </label>
              <p className="hint hint-inline">Posts at or above the threshold get a Hot badge.</p>

              <div className="footer-toggle engagement-toggle">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={config.hideLowEngagement}
                    onChange={(e) => update({ hideLowEngagement: e.target.checked })}
                    aria-label="Hide low engagement"
                  />
                  <span className="switch-track" aria-hidden="true">
                    <span className="switch-thumb" />
                  </span>
                  <span className="switch-label">Hide low engagement</span>
                </label>
              </div>
              <label className={`field${config.hideLowEngagement ? '' : ' field-disabled'}`}>
                <span className="field-label">Min engagement %</span>
                <input
                  type="number"
                  min={0}
                  step={0.1}
                  disabled={!config.hideLowEngagement}
                  value={config.hideLowEngagementPct}
                  onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    if (!Number.isFinite(n) || n < 0) return;
                    update({ hideLowEngagementPct: n });
                  }}
                />
              </label>
              <p className="hint hint-inline">Posts below this rate are hidden once view counts load.</p>
            </div>
          )}

          {tab === 'model' && (
            <div className="panel-pane" role="tabpanel" id="panel-model" aria-labelledby="tab-model">
              <div className="panel-head">
                <h2>Classifier</h2>
                <p className="panel-desc">Choose what judges each post.</p>
              </div>
              <div className="segment" role="group" aria-label="Classifier backend">
                <button
                  type="button"
                  className={provider === 'on-device' ? 'segment-btn segment-on' : 'segment-btn'}
                  aria-pressed={provider === 'on-device'}
                  onClick={() => setProvider('on-device')}
                >
                  On-device
                </button>
                <button
                  type="button"
                  className={provider === 'openai' ? 'segment-btn segment-on' : 'segment-btn'}
                  aria-pressed={provider === 'openai'}
                  onClick={() => setProvider('openai')}
                >
                  API
                </button>
              </div>

              {provider === 'on-device' ? (
                <div className="model-panel">
                  <ModelBanner model={model} progress={progress} onDownload={downloadModel} />
                </div>
              ) : (
                <div className="model-panel fields">
                  <label className="field">
                    <span className="field-label">Base URL</span>
                    <input
                      value={config.apiBaseUrl}
                      placeholder="https://api.openai.com/v1"
                      onChange={(e) => setApiBaseUrl(e.target.value)}
                      onBlur={() => void commitApiBaseUrl()}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">API key</span>
                    <input
                      type="password"
                      value={config.apiKey}
                      placeholder="sk-…"
                      onChange={(e) => update({ apiKey: e.target.value })}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Model</span>
                    <input
                      value={config.apiModel}
                      placeholder="gpt-4o-mini"
                      onChange={(e) => update({ apiModel: e.target.value })}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  </label>
                  <p className="hint hint-inline">
                    Posts you scroll past are sent to this endpoint. The key is stored unencrypted in the browser.
                  </p>
                  <div className="api-actions">
                    <button
                      type="button"
                      className="add add-compact"
                      onClick={() => void testApi()}
                      disabled={apiTest === 'testing'}
                    >
                      {apiTest === 'testing' ? 'Testing…' : 'Test connection'}
                    </button>
                    {apiTest === 'ok' && <span className="api-status api-ok">Connected</span>}
                    {apiTest === 'error' && (
                      <span className="api-status api-err" title={apiError}>
                        {apiError || 'Failed'}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <footer className="footer">
        <label className="switch">
          <input
            type="checkbox"
            checked={config.debug}
            onChange={(e) => update({ debug: e.target.checked })}
            aria-label="Debug labels"
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="switch-label">Debug labels</span>
        </label>
        <span className="footer-hint">Reload an open X tab to re-scan posts already on screen.</span>
      </footer>
    </div>
  );
}

function ModelBanner({
  model,
  progress,
  onDownload,
}: {
  model: ModelState;
  progress: number | null;
  onDownload: () => void;
}) {
  const pct = progress != null ? ` ${Math.round(progress * 100)}%` : '';
  const meta: Record<ModelState, { cls: string; text: string }> = {
    checking: { cls: 'banner-info', text: 'Checking AI…' },
    ready: { cls: 'banner-ok', text: 'AI ready' },
    downloading: { cls: 'banner-info', text: `Downloading model…${pct}` },
    downloadable: { cls: 'banner-info', text: 'On-device model not downloaded' },
    unavailable: { cls: 'banner-warn', text: 'AI unavailable on this device' },
    unsupported: { cls: 'banner-warn', text: 'Needs Chrome 138+ with Prompt API' },
  };
  const m = meta[model];
  const warn = model === 'unavailable' || model === 'unsupported';
  const ready = model === 'ready';

  return (
    <>
      <div className={`banner ${m.cls}${ready ? ' banner-ready' : ''}`}>
        <span className="status">
          <span className={`dot dot-${model}`} />
          {m.text}
        </span>
        {model === 'downloadable' && (
          <button type="button" className="add add-compact" onClick={onDownload}>
            Download
          </button>
        )}
      </div>
      {warn && (
        <p className="hint hint-inline">
          Category &amp; rule filters need Gemini Nano; author blocking works without it.
        </p>
      )}
    </>
  );
}

export default App;
