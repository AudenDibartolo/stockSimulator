import { useState } from 'react';
import { api } from '../api.js';
import { useFetch, useLive } from '../live.jsx';
import { money, qty, dateTime, signedMoney, tone, pct } from '../format.js';
import { useCatalog, describeConfig, universeText, configFromTemplate, blankConfig } from '../botText.js';
import BotBuilder from '../components/BotBuilder.jsx';
import TemplatePicker, { TemplateDetails } from '../components/TemplatePicker.jsx';
import ScanResults from '../components/ScanResults.jsx';

export default function Bots({ route, portfolios, portfolioId, draft, clearDraft, onBacktest }) {
  const { data: catalog, error } = useCatalog();
  if (error) return <div className="card error">{error.message}</div>;
  if (!catalog) return <div className="card muted">Loading…</div>;

  const editId = route[2] === 'edit' ? route[1] : null;
  if (route[1] === 'new' || editId) {
    return (
      <BotEditor
        key={editId ?? 'new'}
        catalog={catalog}
        editId={editId}
        portfolios={portfolios}
        defaultPortfolioId={portfolioId}
        draft={draft}
        clearDraft={clearDraft}
        onBacktest={onBacktest}
      />
    );
  }
  return <BotList catalog={catalog} portfolios={portfolios} />;
}

// ---- List ---------------------------------------------------------------------

function BotList({ catalog, portfolios }) {
  const { botVersion, portfolioVersion } = useLive();
  const bots = useFetch('/api/bots', [botVersion, portfolioVersion]);

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <div>
            <h2>Trading bots</h2>
            <p className="muted small">
              A bot follows a set of stocks and checks its rules every 30 seconds against live prices. Each rule acts at most once per
              bar for each stock. Bots only trade while the market is open. To compare bots fairly, give each one its own portfolio and
              watch the Leaderboard.
            </p>
          </div>
          <a className="button primary" href="#/bots/new">
            New bot
          </a>
        </div>
      </section>

      {bots.data?.length === 0 && (
        <section className="card">
          <h3>No bots yet</h3>
          <p className="muted">Start from one of these ready-made strategies, or build your own from scratch.</p>
          <TemplatePicker
            catalog={catalog}
            onPick={(t) => (window.location.hash = `/bots/new?template=${t.id}`)}
            onBlank={() => (window.location.hash = '/bots/new?template=blank')}
          />
        </section>
      )}

      {bots.data?.map((bot) => (
        <BotCard key={bot.id} bot={bot} catalog={catalog} portfolios={portfolios} reload={bots.reload} />
      ))}
    </div>
  );
}

function BotCard({ bot, catalog, portfolios, reload }) {
  const { quotes } = useLive();
  const act = (fn) => fn().then(reload).catch((e) => alert(e.message));
  const portfolio = portfolios.find((p) => p.id === bot.portfolioId);
  const positions = Object.entries(bot.state.positions).map(([symbol, p]) => {
    const price = quotes[symbol]?.price ?? portfolio?.positions.find((x) => x.symbol === symbol)?.price ?? p.avgCost;
    const pnl = (price - p.avgCost) * p.qty;
    return { symbol, ...p, price, pnl, pnlPct: (pnl / Math.abs(p.avgCost * p.qty)) * 100 };
  });
  const unrealized = positions.reduce((a, p) => a + p.pnl, 0);
  const config = bot.config;

  return (
    <section className="card bot">
      <div className="row between">
        <div>
          <h3>
            {bot.name} <span className={`badge ${bot.active ? 'open' : ''}`}>{bot.active ? bot.status ?? 'Running' : 'Paused'}</span>
          </h3>
          <div className="muted small">
            {universeText(catalog, config.universe)} · {catalog.intervals[config.interval]} bars · {config.rules.length} rule
            {config.rules.length === 1 ? '' : 's'} · portfolio “{portfolio?.name ?? '—'}”
          </div>
        </div>
        <div className="row gap">
          <button onClick={() => act(() => api.patch(`/api/bots/${bot.id}`, { active: !bot.active }))}>{bot.active ? 'Pause' : 'Resume'}</button>
          <a className="button" href={`#/bots/${bot.id}/edit`}>
            Edit
          </a>
          <button
            className="ghost danger"
            onClick={() => confirm(`Delete bot "${bot.name}"? Its shares stay in the portfolio.`) && act(() => api.del(`/api/bots/${bot.id}`))}
          >
            Delete
          </button>
        </div>
      </div>

      <div className="stats compact">
        <div className="stat">
          <div className="label">Open positions</div>
          <div className="value">{positions.length}</div>
        </div>
        <div className="stat">
          <div className="label">Unrealized</div>
          <div className={`value ${tone(unrealized)}`}>{positions.length ? signedMoney(unrealized) : '—'}</div>
        </div>
        <div className="stat">
          <div className="label">Realized</div>
          <div className={`value ${tone(bot.state.realizedPnl)}`}>{signedMoney(bot.state.realizedPnl ?? 0)}</div>
        </div>
        <div className="stat">
          <div className="label">Trades</div>
          <div className="value">{bot.state.tradeCount ?? 0}</div>
        </div>
      </div>

      {positions.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stock</th>
                <th className="num">Shares</th>
                <th className="num">Entry</th>
                <th className="num">Price</th>
                <th className="num">P/L</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.symbol}>
                  <td>
                    <a href={`#/stock/${p.symbol}`}>{p.symbol}</a> {p.qty < 0 && <span className="tag short">short</span>}
                  </td>
                  <td className="num">{qty(Math.abs(p.qty))}</td>
                  <td className="num">{money(p.avgCost)}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className={`num ${tone(p.pnl)}`}>
                    {signedMoney(p.pnl)} <span className="small">{pct(p.pnlPct)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <details>
        <summary>How this bot works</summary>
        <ul className="plain">
          {describeConfig(catalog, config).map((l, i) => (
            <li key={i}>{l}</li>
          ))}
        </ul>
      </details>
      <details>
        <summary>Latest check {bot.lastScan ? `(${dateTime(bot.lastScan.time)})` : '(not yet run)'}</summary>
        {bot.lastScan ? <ScanResults scan={bot.lastScan} /> : <p className="muted small">The bot hasn't checked its stocks yet.</p>}
      </details>
      <details>
        <summary>Activity log ({bot.log.length})</summary>
        <ul className="log">
          {bot.log.map((l, i) => (
            <li key={i} className={l.level}>
              <span className="muted">{dateTime(l.time)}</span> {l.message}
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

// ---- Create / edit ----------------------------------------------------------------

function initialEditorState(catalog, draft) {
  const params = new URLSearchParams(window.location.hash.split('?')[1] ?? '');
  const tid = params.get('template');
  if (draft) return { config: draft.config, templateId: draft.templateId ?? null };
  if (tid === 'blank') return { config: blankConfig(catalog), templateId: 'blank' };
  const t = catalog.templates.find((x) => x.id === tid);
  if (t) return { config: configFromTemplate(t), templateId: t.id };
  return { config: null, templateId: null };
}

function BotEditor({ catalog, editId, portfolios, defaultPortfolioId, draft, clearDraft, onBacktest }) {
  const existing = useFetch(editId ? '/api/bots' : null);
  const editing = editId ? existing.data?.find((b) => b.id === editId) : null;
  const [state, setState] = useState(() => initialEditorState(catalog, draft));
  const [portfolioId, setPortfolioId] = useState(defaultPortfolioId);
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  // Load the bot being edited once it arrives.
  if (editing && !state.config) {
    setState({ config: { ...blankConfig(catalog), ...editing.config, name: editing.name, universe: { ...blankConfig(catalog).universe, ...editing.config.universe } }, templateId: editing.templateId });
    setPortfolioId(editing.portfolioId);
  }
  if (editId && !editing) return <div className="card muted">{existing.error?.message ?? 'Loading bot…'}</div>;

  const template = catalog.templates.find((t) => t.id === state.templateId);
  const setConfig = (config) => setState((s) => ({ ...s, config }));

  const run = async (kind, fn) => {
    setBusy(kind);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(null);
    }
  };

  const save = () =>
    run('save', async () => {
      if (editing) await api.put(`/api/bots/${editing.id}`, { config: state.config });
      else await api.post('/api/bots', { config: state.config, portfolioId, templateId: state.templateId });
      clearDraft();
      window.location.hash = '/bots';
    });

  const runPreview = () =>
    run('preview', async () => {
      setPreview(await api.post('/api/bots/preview', { config: state.config, portfolioId, botId: editing?.id }));
    });

  if (!state.config) {
    return (
      <section className="card">
        <div className="row between">
          <h2>New bot</h2>
          <a href="#/bots">Cancel</a>
        </div>
        <p className="muted">Pick a ready-made strategy to start from. You can change every part of it afterwards.</p>
        <TemplatePicker
          catalog={catalog}
          onPick={(t) => setState({ config: configFromTemplate(t), templateId: t.id })}
          onBlank={() => setState({ config: blankConfig(catalog), templateId: 'blank' })}
        />
      </section>
    );
  }

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <h2>{editing ? `Edit “${editing.name}”` : 'New bot'}</h2>
          <div className="row gap">
            {!editing && (
              <button className="ghost small" onClick={() => setState({ config: null, templateId: null })}>
                Choose a different template
              </button>
            )}
            <a href="#/bots" onClick={clearDraft}>
              Cancel
            </a>
          </div>
        </div>
        {template && (
          <details className="template-explainer">
            <summary>
              Based on the <b>{template.name}</b> template. {template.summary}
            </summary>
            <TemplateDetails catalog={catalog} template={template} />
          </details>
        )}
        <BotBuilder catalog={catalog} config={state.config} onChange={setConfig} />
      </section>

      <section className="card sticky-actions">
        <div className="row between">
          <label className="inline-label">
            Portfolio
            <select value={portfolioId} disabled={Boolean(editing)} onChange={(e) => setPortfolioId(e.target.value)}>
              {portfolios.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({money(p.buyingPower ?? p.cash)} buying power)
                </option>
              ))}
            </select>
          </label>
          <div className="row gap">
            <button onClick={runPreview} disabled={Boolean(busy)} title="Run the bot once against live data without trading">
              {busy === 'preview' ? 'Checking…' : 'Preview (dry run)'}
            </button>
            <button onClick={() => onBacktest({ config: state.config, templateId: state.templateId })} disabled={Boolean(busy)}>
              Backtest
            </button>
            <button className="primary" onClick={save} disabled={Boolean(busy)}>
              {busy === 'save' ? 'Saving…' : editing ? 'Save changes' : 'Save & start bot'}
            </button>
          </div>
        </div>
        {error && <p className="error">{error}</p>}
      </section>

      {preview && (
        <section className="card">
          <h3>Preview</h3>
          <ScanResults scan={preview} dryRun />
        </section>
      )}
    </div>
  );
}
