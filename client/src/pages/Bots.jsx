import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useFetch, useLive } from '../live.jsx';
import { money, qty, dateTime, signedMoney, tone, pct } from '../format.js';
import StrategyFields, { defaultParams } from '../components/StrategyFields.jsx';

const INTERVAL_LABELS = { '5m': '5 minutes', '15m': '15 minutes', '1h': '1 hour', '1d': '1 day' };

export default function Bots({ portfolios, portfolioId, draft, clearDraft }) {
  const { botVersion, portfolioVersion, quotes } = useLive();
  const bots = useFetch('/api/bots', [botVersion, portfolioVersion]);
  const defs = useFetch('/api/strategies');
  const strategies = defs.data?.strategies ?? [];
  const [showForm, setShowForm] = useState(Boolean(draft));

  useEffect(() => {
    if (draft) setShowForm(true);
  }, [draft]);

  const act = (fn) => fn().then(bots.reload).catch((e) => alert(e.message));
  const portfolioName = (id) => portfolios.find((p) => p.id === id)?.name ?? '—';
  const strategyName = (id) => strategies.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <div>
            <h2>Strategy bots</h2>
            <p className="muted small">
              Bots trade automatically with live prices while the market is open. Each one evaluates its strategy when a
              new bar completes, and checks its stop-loss and take-profit every 30 seconds. To compare strategies, give
              each bot its own portfolio and check the Leaderboard.
            </p>
          </div>
          {!showForm && (
            <button className="primary" onClick={() => setShowForm(true)}>
              New bot
            </button>
          )}
        </div>
        {showForm && strategies.length > 0 && (
          <BotForm
            strategies={strategies}
            intervals={defs.data.botIntervals}
            portfolios={portfolios}
            portfolioId={portfolioId}
            draft={draft}
            onDone={() => {
              setShowForm(false);
              clearDraft();
              bots.reload();
            }}
          />
        )}
      </section>

      {bots.data?.length === 0 && !showForm && (
        <div className="card muted">No bots yet. Create one here, or run a backtest and deploy it.</div>
      )}

      {bots.data?.map((bot) => {
        const price = quotes[bot.symbol]?.price;
        const pos = bot.state.qty ?? 0;
        const unrealized = price && pos ? (price - bot.state.avgCost) * pos : null;
        return (
          <section key={bot.id} className="card bot">
            <div className="row between">
              <div>
                <h3>
                  {bot.name} <span className={`badge ${bot.active ? 'open' : ''}`}>{bot.active ? bot.status ?? 'Running' : 'Paused'}</span>
                </h3>
                <div className="muted small">
                  {strategyName(bot.strategy)} · <a href={`#/stock/${bot.symbol}`}>{bot.symbol}</a> · {INTERVAL_LABELS[bot.interval]} bars · portfolio “
                  {portfolioName(bot.portfolioId)}”
                </div>
              </div>
              <div className="row gap">
                <button onClick={() => act(() => api.patch(`/api/bots/${bot.id}`, { active: !bot.active }))}>{bot.active ? 'Pause' : 'Resume'}</button>
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
                <div className="label">Position</div>
                <div className="value">{qty(pos)} sh</div>
                {pos > 0 && <div className="sub">avg {money(bot.state.avgCost)}</div>}
              </div>
              <div className="stat">
                <div className="label">Unrealized</div>
                <div className={`value ${tone(unrealized)}`}>{unrealized == null ? '—' : signedMoney(unrealized)}</div>
                {unrealized != null && <div className={`sub ${tone(unrealized)}`}>{pct(((price - bot.state.avgCost) / bot.state.avgCost) * 100)}</div>}
              </div>
              <div className="stat">
                <div className="label">Trades</div>
                <div className="value">{bot.state.tradeCount ?? 0}</div>
              </div>
              <div className="stat">
                <div className="label">Parameters</div>
                <div className="small">
                  {Object.entries(bot.params)
                    .filter(([, v]) => v !== 0)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(' · ')}
                </div>
              </div>
            </div>
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
      })}
    </div>
  );
}

function BotForm({ strategies, intervals, portfolios, portfolioId, draft, onDone }) {
  const initialStrategy = draft?.strategy ?? strategies[0].id;
  const [form, setForm] = useState({
    name: '',
    portfolioId,
    symbol: draft?.symbol ?? '',
    strategy: initialStrategy,
    interval: '1d',
    params: draft?.params ?? defaultParams(strategies.find((s) => s.id === initialStrategy)),
  });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/api/bots', form);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="bot-form" onSubmit={submit}>
      {draft && <p className="success small">Prefilled from your backtest.</p>}
      <div className="form-grid">
        <label>
          Bot name
          <input value={form.name} placeholder="optional" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Symbol
          <input required value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} />
        </label>
        <label>
          Portfolio
          <select value={form.portfolioId} onChange={(e) => setForm({ ...form, portfolioId: e.target.value })}>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({money(p.cash)} cash)
              </option>
            ))}
          </select>
        </label>
        <label>
          Bar size
          <select value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })}>
            {intervals.map((i) => (
              <option key={i} value={i}>
                {INTERVAL_LABELS[i] ?? i}
              </option>
            ))}
          </select>
        </label>
      </div>
      <StrategyFields
        strategies={strategies}
        strategyId={form.strategy}
        params={form.params}
        onChange={(strategy, params) => setForm({ ...form, strategy, params })}
      />
      <div className="row gap">
        <button className="primary" disabled={busy}>
          {busy ? 'Starting…' : 'Start bot'}
        </button>
        <button type="button" className="ghost" onClick={onDone}>
          Cancel
        </button>
        {error && <span className="error">{error}</span>}
      </div>
    </form>
  );
}
