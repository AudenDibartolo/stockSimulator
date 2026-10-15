import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useFetch, useLive } from '../live.jsx';
import { money, signedMoney, pct, qty, tone, dateTime } from '../format.js';
import TimeChart from '../components/TimeChart.jsx';

// Re-price a server-side portfolio summary with the latest streamed quotes.
export function withLiveQuotes(portfolio, quotes) {
  if (!portfolio) return null;
  const positions = portfolio.positions.map((p) => {
    const q = quotes[p.symbol];
    if (!q) return p;
    const value = p.qty * q.price;
    return {
      ...p,
      price: q.price,
      value,
      unrealizedPnl: value - p.cost,
      unrealizedPnlPct: p.cost ? ((value - p.cost) / p.cost) * 100 : 0,
      dayChange: p.qty * q.change,
      dayChangePercent: q.changePercent,
    };
  });
  const longValue = positions.reduce((a, p) => a + Math.max(p.value, 0), 0);
  const shortValue = positions.reduce((a, p) => a - Math.min(p.value, 0), 0);
  const totalValue = portfolio.cash + longValue - shortValue;
  return {
    ...portfolio,
    positions,
    longValue,
    shortValue,
    buyingPower: portfolio.cash - 1.5 * shortValue,
    totalValue,
    totalPnl: totalValue - portfolio.startingCash,
    totalPnlPct: (totalValue / portfolio.startingCash - 1) * 100,
    dayChange: positions.reduce((a, p) => a + p.dayChange, 0),
  };
}

export function Stat({ label, value, sub, className = '' }) {
  return (
    <div className="stat">
      <div className="label">{label}</div>
      <div className={`value ${className}`}>{value}</div>
      {sub && <div className={`sub ${className}`}>{sub}</div>}
    </div>
  );
}

export default function Dashboard({ portfolioId, portfolios, selectPortfolio, reloadPortfolios }) {
  const { quotes, portfolioVersion } = useLive();
  const { data, error, reload } = useFetch(`/api/portfolios/${portfolioId}`, [portfolioVersion]);
  const p = withLiveQuotes(data, quotes);
  const [showNew, setShowNew] = useState(false);

  const equitySeries = useMemo(() => {
    if (!data) return [];
    const points = data.equityHistory.map((e) => ({ time: e.time, value: e.value }));
    points.push({ time: Math.floor(Date.now() / 1000), value: data.totalValue });
    const color = data.totalValue >= data.startingCash ? '#22c55e' : '#ef4444';
    return [{ type: 'area', data: points, color }];
  }, [data]);

  if (error) return <div className="card error">{error.message}</div>;
  if (!p) return <div className="card muted">Loading portfolio…</div>;

  const openOrders = p.orders.filter((o) => o.status === 'open');

  const act = async (fn) => {
    try {
      await fn();
      reload();
      reloadPortfolios();
    } catch (e) {
      alert(e.message);
    }
  };

  return (
    <div className="stack">
      <section className="card">
        <div className="row between">
          <div>
            <h2>{p.name}</h2>
            <div className="muted small">
              Started with {money(p.startingCash)} · {p.commission ? `${money(p.commission)} commission per trade` : 'No commissions'}
            </div>
          </div>
          <div className="row gap">
            <button onClick={() => setShowNew((s) => !s)}>New portfolio</button>
            <button
              className="ghost"
              onClick={() =>
                confirm(`Reset "${p.name}" back to ${money(p.startingCash)}? All positions and history are cleared.`) &&
                act(() => api.post(`/api/portfolios/${p.id}/reset`))
              }
            >
              Reset
            </button>
            {portfolios.length > 1 && (
              <button
                className="ghost danger"
                onClick={() =>
                  confirm(`Delete "${p.name}" and its bots? This cannot be undone.`) &&
                  act(() => api.del(`/api/portfolios/${p.id}`))
                }
              >
                Delete
              </button>
            )}
          </div>
        </div>
        {showNew && (
          <NewPortfolioForm
            onCreated={(id) => {
              setShowNew(false);
              reloadPortfolios();
              selectPortfolio(id);
            }}
          />
        )}
        <div className="stats">
          <Stat label="Total value" value={money(p.totalValue)} />
          <Stat label="Today" value={signedMoney(p.dayChange)} className={tone(p.dayChange)} />
          <Stat label="Total return" value={signedMoney(p.totalPnl)} sub={pct(p.totalPnlPct)} className={tone(p.totalPnl)} />
          <Stat label="Realized P/L" value={signedMoney(p.realizedPnl)} className={tone(p.realizedPnl)} />
          <Stat label="Cash" value={money(p.cash)} />
          <Stat label="Buying power" value={money(p.buyingPower)} />
          <Stat label="Long positions" value={money(p.longValue)} />
          {p.shortValue > 0 && <Stat label="Short positions" value={money(-p.shortValue)} className="down" />}
        </div>
        <TimeChart series={equitySeries} height={220} intraday />
      </section>

      <section className="card">
        <h3>Holdings</h3>
        {p.positions.length === 0 ? (
          <p className="muted">
            No positions yet. Search for a stock above or pick one from your watchlist to place your first trade.
          </p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th className="num">Shares</th>
                  <th className="num">Avg cost</th>
                  <th className="num">Price</th>
                  <th className="num">Value</th>
                  <th className="num">Today</th>
                  <th className="num">Unrealized P/L</th>
                  <th className="num">Weight</th>
                </tr>
              </thead>
              <tbody>
                {p.positions.map((pos) => (
                  <tr key={pos.symbol}>
                    <td>
                      <a href={`#/stock/${pos.symbol}`}>
                        <b>{pos.symbol}</b>
                      </a>{' '}
                      {pos.qty < 0 && <span className="tag short">short</span>}
                      <div className="muted small ellipsis">{pos.name}</div>
                    </td>
                    <td className="num">{qty(pos.qty)}</td>
                    <td className="num">{money(pos.avgCost)}</td>
                    <td className="num">{money(pos.price)}</td>
                    <td className="num">{money(pos.value)}</td>
                    <td className={`num ${tone(pos.dayChange)}`}>
                      {signedMoney(pos.dayChange)}
                      <div className="small">{pct(pos.dayChangePercent)}</div>
                    </td>
                    <td className={`num ${tone(pos.unrealizedPnl)}`}>
                      {signedMoney(pos.unrealizedPnl)}
                      <div className="small">{pct(pos.unrealizedPnlPct)}</div>
                    </td>
                    <td className="num">{((Math.abs(pos.value) / p.totalValue) * 100).toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {openOrders.length > 0 && (
        <section className="card">
          <h3>Open orders</h3>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Placed</th>
                  <th>Symbol</th>
                  <th>Order</th>
                  <th className="num">Shares</th>
                  <th className="num">Trigger</th>
                  <th className="num">Last</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {openOrders.map((o) => (
                  <tr key={o.id}>
                    <td>{dateTime(o.createdAt)}</td>
                    <td>
                      <a href={`#/stock/${o.symbol}`}>{o.symbol}</a>
                    </td>
                    <td className={o.side === 'buy' || o.side === 'cover' ? 'up' : 'down'}>
                      {o.type} {o.side}
                    </td>
                    <td className="num">{qty(o.qty)}</td>
                    <td className="num">{money(o.limitPrice ?? o.stopPrice)}</td>
                    <td className="num">{money(quotes[o.symbol]?.price)}</td>
                    <td className="num">
                      <button className="ghost small" onClick={() => act(() => api.del(`/api/portfolios/${p.id}/orders/${o.id}`))}>
                        Cancel
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="card">
        <h3>Activity</h3>
        <Transactions transactions={p.transactions} orders={p.orders} />
      </section>
    </div>
  );
}

function Transactions({ transactions, orders }) {
  const rejected = orders.filter((o) => o.status === 'rejected');
  if (!transactions.length && !rejected.length) return <p className="muted">No trades yet.</p>;
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Symbol</th>
            <th>Side</th>
            <th className="num">Shares</th>
            <th className="num">Price</th>
            <th className="num">Total</th>
            <th className="num">Realized</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rejected.map((o) => (
            <tr key={o.id} className="muted">
              <td>{dateTime(o.closedAt)}</td>
              <td>{o.symbol}</td>
              <td>
                {o.type} {o.side}
              </td>
              <td className="num">{qty(o.qty)}</td>
              <td colSpan={4} className="down">
                Rejected: {o.rejectReason}
              </td>
            </tr>
          ))}
          {transactions.map((t) => (
            <tr key={t.id}>
              <td>{dateTime(t.time)}</td>
              <td>
                <a href={`#/stock/${t.symbol}`}>{t.symbol}</a>
              </td>
              <td className={t.side === 'buy' || t.side === 'cover' ? 'up' : 'down'}>{t.side.toUpperCase()}</td>
              <td className="num">{qty(t.qty)}</td>
              <td className="num">{money(t.price)}</td>
              <td className="num">{money(t.total)}</td>
              <td className={`num ${tone(t.realizedPnl)}`}>{t.side === 'sell' || t.side === 'cover' ? signedMoney(t.realizedPnl) : ''}</td>
              <td className="small">
                <span className={`tag ${t.source}`}>{t.source === 'manual' ? t.orderType : t.source}</span>{' '}
                <span className="muted">{t.reason}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NewPortfolioForm({ onCreated }) {
  const [form, setForm] = useState({ name: '', startingCash: 100000, commission: 0 });
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { id } = await api.post('/api/portfolios', form);
      onCreated(id);
    } catch (err) {
      setError(err.message);
    }
  };
  return (
    <form className="inline-form" onSubmit={submit}>
      <label>
        Name
        <input required value={form.name} placeholder="e.g. Momentum bots" onChange={(e) => setForm({ ...form, name: e.target.value })} />
      </label>
      <label>
        Starting cash ($)
        <input type="number" min="100" step="any" value={form.startingCash} onChange={(e) => setForm({ ...form, startingCash: e.target.value })} />
      </label>
      <label>
        Commission per trade ($)
        <input type="number" min="0" step="any" value={form.commission} onChange={(e) => setForm({ ...form, commission: e.target.value })} />
      </label>
      <button className="primary" type="submit">
        Create
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}
