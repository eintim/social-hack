import { useEffect, useState } from 'react';
import { filterConfig } from '@/lib/storage';
import { CATEGORIES } from '@/lib/categories';
import type { FilterConfig } from '@/lib/types';
import './App.css';

type ModelState = 'checking' | 'unsupported' | 'unavailable' | 'downloadable' | 'downloading' | 'ready';

const EXPECTED = [{ type: 'text' as const, languages: ['en'] }];

function normalizeAvailability(value: string): ModelState {
  if (value === 'available' || value === 'readily') return 'ready';
  if (value === 'downloadable' || value === 'after-download') return 'downloadable';
  if (value === 'downloading') return 'downloading';
  return 'unavailable';
}

function App() {
  const [config, setConfig] = useState<FilterConfig | null>(null);
  const [model, setModel] = useState<ModelState>('checking');
  const [progress, setProgress] = useState<number | null>(null);
  const [newRule, setNewRule] = useState('');
  const [newAuthor, setNewAuthor] = useState('');

  useEffect(() => {
    filterConfig.getValue().then(setConfig);
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

  if (!config) return <div className="app">Loading…</div>;

  return (
    <div className="app">
      <header className="header">
        <h1>Feed Filter</h1>
        <label className="switch">
          <input
            type="checkbox"
            checked={config.enabled}
            onChange={(e) => update({ enabled: e.target.checked })}
            aria-label={config.enabled ? 'Filtering on' : 'Filtering off'}
          />
          <span className="switch-track" aria-hidden="true">
            <span className="switch-thumb" />
          </span>
          <span className="switch-label">{config.enabled ? 'On' : 'Off'}</span>
        </label>
      </header>

      <ModelBanner model={model} progress={progress} onDownload={downloadModel} />

      <section>
        <h2>Hide from feed</h2>
        <div className="tiles">
          {CATEGORIES.map((cat) => {
            const active = !!config.categories[cat.id];
            return (
              <button
                key={cat.id}
                type="button"
                className={active ? 'tile tile-on' : 'tile'}
                title={cat.description}
                aria-pressed={active}
                onClick={() =>
                  update({ categories: { ...config.categories, [cat.id]: !active } })
                }
              >
                <span className="tile-emoji" aria-hidden="true">
                  {cat.emoji}
                </span>
                <span className="tile-label">{cat.label}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section>
        <h2>Custom rules</h2>
        <div className="row">
          <input
            value={newRule}
            placeholder="e.g. hide AI hype threads"
            onChange={(e) => setNewRule(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addRule()}
          />
          <button type="button" className="add" onClick={addRule}>
            Add
          </button>
        </div>
        <ul className="list">
          {config.rules.map((rule, i) => (
            <li key={i}>
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
            <li className="empty">Add a rule to hide posts that match it.</li>
          )}
        </ul>
      </section>

      <section>
        <h2>Blocked authors</h2>
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
        <ul className="list">
          {config.blockedAuthors.map((h, i) => (
            <li key={i}>
              <span>@{h}</span>
              <button
                type="button"
                className="remove"
                aria-label={`Unblock @${h}`}
                onClick={() =>
                  update({ blockedAuthors: config.blockedAuthors.filter((_, j) => j !== i) })
                }
              >
                ×
              </button>
            </li>
          ))}
          {config.blockedAuthors.length === 0 && (
            <li className="empty">Block an author to hide their posts.</li>
          )}
        </ul>
      </section>

      <div className="footer-toggle">
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
        <span className="footer-toggle-hint">Show a per-post outcome badge on the feed</span>
      </div>

      <p className="hint">Reload an open X tab to re-scan posts already on screen.</p>
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
