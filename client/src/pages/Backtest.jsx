import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { money, pct, qty, tone, date, dateTime, signedMoney } from '../format.js';
import { useCatalog, configFromTemplate, blankConfig } from '../botText.js';
import TimeChart from '../components/TimeChart.jsx';
import BotBuilder from '../components/BotBuilder.jsx';
import { TemplateDetails } from '../components/TemplatePicker.jsx';
import { Stat } from './Dashboard.jsx';
import HelpLink from '../components/HelpLink.jsx';

function initialConfig(catalog, draft, initialSymbol) {
  if (draft) return { config: draft.config, templateId: draft.templateId ?? 'blank' };
  const t = catalog.templates.find((x) => x.id === 'sma');
  const config = configFromTemplate(t);
  if (initialSymbol) {
    config.universe = { ...config.universe, source: 'list', symbols: [initialSymbol.toUpperCase()] };
    config.limits = { ...config.limits, maxPositionPct: 100 };
    config.rules = config.rules.map((r) => (r.action.sizing === 'pct_equity' ? { ...r, action: { ...r.action, amount: 100 } } : r));
  }
  return { config, templateId: t.id };
}

export default function Backtest(props) {
  const { data: catalog, error } = useCatalog();
  if (error) return <div className="card error">{error.message}</div>;
  if (!catalog) return <div className="card muted">Loading…</div>;
  return <BacktestInner catalog={catalog} {...props} />;
}

function BacktestInner({ catalog, initialSymbol, draft, clearDraft, onDeploy }) {
  const [{ config, templateId }, setState] = useState(() => initialConfig(catalog, draft, initialSymbol));
  const [settings, setSettings] = useState({ range: '2y', startingCash: 100000, commission: 0 });
  const [result, setResult] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const ranges = catalog.backtestRanges[config.interval] ?? [];
  const range = ranges.includes(settings.range) ? settings.range : ranges.at(-1);
  const template = catalog.templates.find((t) => t.id === templateId);

  const pickTemplate = (id) => {
    clearDraft();
    setResult(null);
    if (id === 'blank') setState({ config: blankConfig(catalog), templateId: 'blank' });
    else setState({ config: configFromTemplate(catalog.templates.find((t) => t.id === id)), templateId: id });
  };

  const run = async () => {
    setBusy(true);
    setErr(null);
    try {
      setResult(await api.post('/api/backtest', { config, ...settings, range }));
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <h2>
          Backtest a bot <HelpLink topic="backtest" label="backtesting" />
        </h2>
        <p className="muted small">
          Replays your bot over real historical prices for every stock it follows, sharing one cash balance like a real portfolio.
          Orders fill at the close of the bar that triggered them. The benchmark splits the same money equally across the stocks and
          simply holds them.
        </p>
        <label className="inline-label">
          Start from
          <select value={templateId ?? 'blank'} onChange={(e) => pickTemplate(e.target.value)}>
            {catalog.templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
            <option value="blank">Blank bot</option>
          </select>
        </label>
        {template && (
          <details className="template-explainer">
            <summary>{template.summary}</summary>
            <TemplateDetails catalog={catalog} template={template} />
          </details>
        )}
        <BotBuilder catalog={catalog} config={config} onChange={(c) => setState((s) => ({ ...s, config: c }))} showName={false} />
      </section>

      <section className="card sticky-actions">
        <div className="row between">
          <div className="row gap">
            <label className="inline-label">
              Period
              <select value={range} onChange={(e) => setSettings({ ...settings, range: e.target.value })}>
                {ranges.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <label className="inline-label">
              Starting cash
              <input type="number" min="100" step="any" value={settings.startingCash} onChange={(e) => setSettings({ ...settings, startingCash: e.target.value })} />
            </label>
            <label className="inline-label">
              Commission / trade
              <input type="number" min="0" step="any" value={settings.commission} onChange={(e) => setSettings({ ...settings, commission: e.target.value })} />
            </label>
          </div>
          <div className="row gap">
            {result && <button onClick={() => onDeploy({ config, templateId })}>Deploy as live bot →</button>}
            <button className="primary" onClick={run} disabled={busy}>
              {busy ? 'Running…' : 'Run backtest'}
            </button>
          </div>
        </div>
        {err && <p className="error">{err}</p>}
      </section>

      {result && <Results result={result} />}
    </div>
  );
}

function Results({ result }) {
  const m = result.metrics;
  const beat = m.totalReturnPct - m.benchmarkReturnPct;
  const priced = Object.keys(result.prices);
  const [symbol, setSymbol] = useState(priced[0]);
  const shown = result.prices[symbol] ? symbol : priced[0];
  const intraday = ['5m', '15m', '1h'].includes(result.interval);
  const when = intraday ? (t) => dateTime(t * 1000) : date;

  const equitySeries = useMemo(
    () => [
      { type: 'line', data: result.benchmark, color: '#8b95a7', title: 'Buy & hold' },
      { type: 'line', data: result.equity, color: '#60a5fa', title: 'Bot' },
    ],
    [result],
  );
  const priceSeries = useMemo(
    () =>
      shown
        ? [
            {
              type: 'line',
              data: result.prices[shown],
              color: '#cbd5e1',
              markers: result.trades
                .filter((t) => t.symbol === shown)
                .map((t) => ({ time: t.time, side: t.side === 'buy' || t.side === 'cover' ? 'buy' : 'sell', text: t.side[0].toUpperCase() })),
            },
          ]
        : [],
    [result, shown],
  );

  return (
    <>
      <section className="card">
        <h3>
          Results · {result.range} of {result.interval} bars · {result.symbols.length} stock{result.symbols.length === 1 ? '' : 's'}{' '}
          <HelpLink topic="backtest-results" label="reading results" />
        </h3>
        {result.warnings.map((w, i) => (
          <p key={i} className="warn small">
            ⚠ {w}
          </p>
        ))}
        <div className="stats">
          <Stat label="Final value" value={money(m.finalValue)} sub={pct(m.totalReturnPct)} className={tone(m.totalReturnPct)} />
          <Stat label="Buy & hold" value={pct(m.benchmarkReturnPct)} className={tone(m.benchmarkReturnPct)} />
          <Stat label="vs. buy & hold" value={pct(beat)} className={tone(beat)} />
          <Stat label="Yearly growth (CAGR)" value={m.cagrPct == null ? '—' : pct(m.cagrPct)} className={tone(m.cagrPct)} />
          <Stat label="Max drawdown" value={pct(m.maxDrawdownPct)} className="down" />
          <Stat label="Sharpe ratio" value={m.sharpe.toFixed(2)} />
          <Stat label="Trades" value={m.tradeCount} sub={m.winRatePct == null ? 'no closed trades' : `${m.winRatePct.toFixed(0)}% of exits profitable`} />
        </div>
        <p className="hint">
          Max drawdown is the worst peak-to-trough drop. Sharpe ratio measures return per unit of risk; above 1 is good.
        </p>
        <h4>Portfolio value: bot vs. buy &amp; hold</h4>
        <TimeChart series={equitySeries} height={260} intraday={intraday} />
      </section>

      <section className="card">
        <h3>By stock</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Stock</th>
                <th className="num">Trades</th>
                <th className="num">Realized P/L</th>
                <th className="num">Still holding</th>
                <th className="num">Stock's own return</th>
              </tr>
            </thead>
            <tbody>
              {result.symbols.map((s) => (
                <tr key={s.symbol} className={result.prices[s.symbol] ? 'clickable' : ''} onClick={() => result.prices[s.symbol] && setSymbol(s.symbol)}>
                  <td>
                    <b>{s.symbol}</b> {s.symbol === shown && <span className="tag">charted</span>}
                  </td>
                  <td className="num">{s.trades}</td>
                  <td className={`num ${tone(s.realizedPnl)}`}>{signedMoney(s.realizedPnl)}</td>
                  <td className="num">{s.openQty ? qty(s.openQty) : '—'}</td>
                  <td className={`num ${tone(s.buyHoldPct)}`}>{pct(s.buyHoldPct)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {shown && (
          <>
            <h4>{shown} price with the bot's trades (▲ buy/cover, ▼ sell/short)</h4>
            <TimeChart series={priceSeries} height={260} intraday={intraday} />
          </>
        )}
      </section>

      <section className="card">
        <h3>Trades {result.trades.length > 300 && <span className="muted small">(latest 300 of {result.trades.length})</span>}</h3>
        {result.trades.length === 0 ? (
          <p className="muted">The bot never traded in this period. Use Preview on the Bots page to see which conditions are failing, or loosen the rules.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Stock</th>
                  <th>Action</th>
                  <th className="num">Shares</th>
                  <th className="num">Price</th>
                  <th className="num">Realized</th>
                  <th>Why</th>
                </tr>
              </thead>
              <tbody>
                {result.trades
                  .slice(-300)
                  .reverse()
                  .map((t, i) => (
                    <tr key={i}>
                      <td>{when(t.time)}</td>
                      <td>{t.symbol}</td>
                      <td className={t.side === 'buy' || t.side === 'cover' ? 'up' : 'down'}>{t.side.toUpperCase()}</td>
                      <td className="num">{qty(t.qty)}</td>
                      <td className="num">{money(t.price)}</td>
                      <td className={`num ${tone(t.realizedPnl)}`}>{t.side === 'sell' || t.side === 'cover' ? signedMoney(t.realizedPnl) : ''}</td>
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
