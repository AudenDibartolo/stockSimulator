import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useFetch } from '../live.jsx';
import { money, pct, qty, tone, date, signedMoney } from '../format.js';
import TimeChart from '../components/TimeChart.jsx';
import StrategyFields, { defaultParams } from '../components/StrategyFields.jsx';
import { Stat } from './Dashboard.jsx';

export default function Backtest({ initialSymbol, onDeploy }) {
  const defs = useFetch('/api/strategies');
  const options = useFetch('/api/backtest/options');
  const strategies = defs.data?.strategies ?? [];

  const [form, setForm] = useState({
    symbol: (initialSymbol || 'SPY').toUpperCase(),
    strategy: 'smaCrossover',
    params: {},
    interval: '1d',
    range: '2y',
    startingCash: 10000,
    commission: 0,
  });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (strategies.length && !Object.keys(form.params).length) {
      setForm((f) => ({ ...f, params: defaultParams(strategies.find((s) => s.id === f.strategy)) }));
    }
  }, [strategies, form.params]);

  const ranges = options.data?.[form.interval] ?? [];

  const run = async (e) => {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      setResult(await api.post('/api/backtest', form));
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <form className="card" onSubmit={run}>
        <h2>Backtest a strategy</h2>
        <p className="muted small">
          Replays a strategy over real historical prices. Orders fill at the close of the bar that triggered them.
        </p>
        <div className="form-grid">
          <label>
            Symbol
            <input value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value.toUpperCase() })} required />
          </label>
          <label>
            Bar size
            <select
              value={form.interval}
              onChange={(e) => {
                const interval = e.target.value;
                const valid = options.data?.[interval] ?? [];
                setForm({ ...form, interval, range: valid.includes(form.range) ? form.range : valid.at(-1) });
              }}
            >
              <option value="1h">1 hour</option>
              <option value="1d">1 day</option>
              <option value="1wk">1 week</option>
            </select>
          </label>
          <label>
            Period
            <select value={form.range} onChange={(e) => setForm({ ...form, range: e.target.value })}>
              {ranges.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label>
            Starting cash ($)
            <input type="number" min="100" step="any" value={form.startingCash} onChange={(e) => setForm({ ...form, startingCash: e.target.value })} />
          </label>
          <label>
            Commission per trade ($)
            <input type="number" min="0" step="any" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} />
          </label>
        </div>
        <StrategyFields
          strategies={strategies}
          strategyId={form.strategy}
          params={form.params}
          onChange={(strategy, params) => setForm({ ...form, strategy, params })}
        />
        <div className="row gap">
          <button className="primary" disabled={busy || !strategies.length}>
            {busy ? 'Running…' : 'Run backtest'}
          </button>
          {error && <span className="error">{error}</span>}
        </div>
      </form>
      {result && <Results result={result} onDeploy={() => onDeploy({ symbol: result.symbol, strategy: form.strategy, params: form.params })} />}
    </div>
  );
}

function Results({ result, onDeploy }) {
  const m = result.metrics;
  const beat = m.totalReturnPct - m.benchmarkReturnPct;

  const equitySeries = useMemo(
    () => [
      { type: 'line', data: result.benchmark, color: '#8b95a7', title: 'Buy & hold' },
      { type: 'line', data: result.equity, color: '#60a5fa', title: 'Strategy' },
    ],
    [result],
  );
  const priceSeries = useMemo(
    () => [
      {
        type: 'line',
        data: result.candles.map((c) => ({ time: c.time, value: c.close })),
        color: '#cbd5e1',
        markers: result.trades.map((t) => ({ time: t.time, side: t.side, text: t.side === 'buy' ? 'B' : 'S' })),
      },
    ],
    [result],
  );

  return (
    <>
      <section className="card">
        <div className="row between">
          <h3>
            {result.strategy} on {result.symbol} · {result.range} of {result.interval} bars
          </h3>
          <button onClick={onDeploy}>Deploy as live bot →</button>
        </div>
        <div className="stats">
          <Stat label="Final value" value={money(m.finalValue)} sub={pct(m.totalReturnPct)} className={tone(m.totalReturnPct)} />
          <Stat label="Buy & hold" value={pct(m.benchmarkReturnPct)} className={tone(m.benchmarkReturnPct)} />
          <Stat label="vs. buy & hold" value={pct(beat)} className={tone(beat)} />
          <Stat label="CAGR" value={pct(m.cagrPct)} className={tone(m.cagrPct)} />
          <Stat label="Max drawdown" value={pct(m.maxDrawdownPct)} className="down" />
          <Stat label="Sharpe ratio" value={m.sharpe.toFixed(2)} />
          <Stat label="Trades" value={m.tradeCount} sub={m.winRatePct == null ? 'no closed trades' : `${m.winRatePct.toFixed(0)}% winners`} />
        </div>
        <h4>Equity: strategy vs. buy &amp; hold</h4>
        <TimeChart series={equitySeries} height={260} intraday={result.interval === '1h'} />
        <h4>Price &amp; trades</h4>
        <TimeChart series={priceSeries} height={260} intraday={result.interval === '1h'} />
      </section>
      <section className="card">
        <h3>Trades</h3>
        {result.trades.length === 0 ? (
          <p className="muted">The strategy never triggered in this period. Try different parameters or a longer period.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Side</th>
                  <th className="num">Shares</th>
                  <th className="num">Price</th>
                  <th className="num">Realized</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {result.trades.map((t, i) => (
                  <tr key={i}>
                    <td>{date(t.time)}</td>
                    <td className={t.side === 'buy' ? 'up' : 'down'}>{t.side.toUpperCase()}</td>
                    <td className="num">{qty(t.qty)}</td>
                    <td className="num">{money(t.price)}</td>
                    <td className={`num ${tone(t.realizedPnl)}`}>{t.side === 'sell' ? signedMoney(t.realizedPnl) : ''}</td>
                    <td className="muted small">{t.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
