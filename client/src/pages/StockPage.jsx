import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useFetch, useLive } from '../live.jsx';
import { money, signedMoney, pct, qty, tone, big } from '../format.js';
import TimeChart from '../components/TimeChart.jsx';
import { Stat } from './Dashboard.jsx';

const RANGES = [
  ['1d', '1D'],
  ['5d', '5D'],
  ['1mo', '1M'],
  ['6mo', '6M'],
  ['1y', '1Y'],
  ['5y', '5Y'],
];

export default function StockPage({ symbol, portfolioId, portfolios, inWatchlist, toggleWatch, reloadPortfolios }) {
  const { quotes } = useLive();
  const initial = useFetch(`/api/quote/${symbol}`);
  const quote = quotes[symbol] ?? initial.data;
  const [preset, setPreset] = useState('1d');
  const [chartType, setChartType] = useState('area');
  const [refresh, setRefresh] = useState(0);
  const history = useFetch(`/api/history/${symbol}?preset=${preset}`, [refresh]);

  // Keep the intraday chart current while the market is open.
  useEffect(() => {
    if (preset !== '1d' || !quote?.marketOpen) return;
    const t = setInterval(() => setRefresh((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, [preset, quote?.marketOpen]);

  const series = useMemo(() => {
    const candles = history.data?.candles ?? [];
    if (chartType === 'candles') return [{ type: 'candles', data: candles }];
    const up = candles.length < 2 || candles.at(-1).close >= candles[0].close;
    return [{ type: 'area', data: candles.map((c) => ({ time: c.time, value: c.close })), color: up ? '#22c55e' : '#ef4444' }];
  }, [history.data, chartType]);

  if (initial.error && !quote) {
    return (
      <div className="card error">
        Could not load {symbol}: {initial.error.message}
      </div>
    );
  }
  if (!quote) return <div className="card muted">Loading {symbol}…</div>;

  const portfolio = portfolios.find((p) => p.id === portfolioId);
  const position = portfolio?.positions.find((p) => p.symbol === symbol);

  return (
    <div className="stock-grid">
      <section className="card">
        <div className="row between">
          <div>
            <h2>
              {quote.symbol} <span className="muted name">{quote.name}</span>
            </h2>
            <div className="muted small">
              {quote.exchange} · {quote.currency}{' '}
              <span className={`badge ${quote.marketOpen ? 'open' : ''}`}>{quote.marketOpen ? 'Market open' : 'Market closed'}</span>
            </div>
          </div>
          <button className={inWatchlist ? 'ghost' : ''} onClick={toggleWatch}>
            {inWatchlist ? '★ Watching' : '☆ Watch'}
          </button>
        </div>
        <div className="quote-price">
          <span className="big-price">{money(quote.price)}</span>
          <span className={tone(quote.change)}>
            {signedMoney(quote.change)} ({pct(quote.changePercent)}) today
          </span>
        </div>
        <div className="row between chart-controls">
          <div className="seg">
            {RANGES.map(([id, label]) => (
              <button key={id} className={preset === id ? 'on' : ''} onClick={() => setPreset(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="seg">
            <button className={chartType === 'area' ? 'on' : ''} onClick={() => setChartType('area')}>
              Line
            </button>
            <button className={chartType === 'candles' ? 'on' : ''} onClick={() => setChartType('candles')}>
              Candles
            </button>
          </div>
        </div>
        {history.error ? <p className="error">{history.error.message}</p> : <TimeChart series={series} height={360} intraday={['1d', '5d', '1mo'].includes(preset)} />}
        <div className="stats">
          <Stat label="Previous close" value={money(quote.previousClose)} />
          <Stat label="Day range" value={`${money(quote.dayLow)} – ${money(quote.dayHigh)}`} />
          <Stat label="52-week range" value={`${money(quote.fiftyTwoWeekLow)} – ${money(quote.fiftyTwoWeekHigh)}`} />
          <Stat label="Volume" value={big(quote.volume)} />
        </div>
        <p className="small">
          <a href={`#/backtest/${symbol}`}>Backtest a strategy on {symbol} →</a>
        </p>
      </section>

      <OrderTicket
        key={portfolioId}
        quote={quote}
        portfolio={portfolio}
        position={position}
        onFilled={reloadPortfolios}
      />
    </div>
  );
}

function OrderTicket({ quote, portfolio, position, onFilled }) {
  const [side, setSide] = useState('buy');
  const [type, setType] = useState('market');
  const [mode, setMode] = useState('shares');
  const [amount, setAmount] = useState('');
  const [trigger, setTrigger] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);

  const refPrice = type === 'market' ? quote.price : Number(trigger) || quote.price;
  const shares = mode === 'shares' ? Number(amount) || 0 : (Number(amount) || 0) / refPrice;
  const estimate = shares * refPrice;
  const held = position?.qty ?? 0; // negative when short
  const buyingPower = portfolio?.buyingPower ?? portfolio?.cash ?? 0;
  const buying = side === 'buy' || side === 'cover';

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const body = { symbol: quote.symbol, side, type };
      if (mode === 'shares') body.qty = amount;
      else body.dollars = amount;
      if (type === 'limit') body.limitPrice = trigger;
      if (type === 'stop') body.stopPrice = trigger;
      const res = await api.post(`/api/portfolios/${portfolio.id}/orders`, body);
      if (res.status === 'filled' && res.transaction) {
        const t = res.transaction;
        const verb = { buy: 'Bought', sell: 'Sold', short: 'Shorted', cover: 'Covered' }[t.side];
        setMsg({ ok: true, text: `${verb} ${qty(t.qty)} ${t.symbol} @ ${money(t.price)}${t.reason ? ` (${t.reason})` : ''}` });
      } else if (res.status === 'filled') {
        setMsg({ ok: true, text: `${type} order filled immediately` });
      } else if (res.status === 'rejected') {
        setMsg({ ok: false, text: `Order rejected: ${res.order.rejectReason}` });
      } else {
        setMsg({ ok: true, text: `${type} order placed: ${side} ${qty(res.order.qty)} ${quote.symbol} at ${money(Number(trigger))}` });
      }
      setAmount('');
      onFilled();
    } catch (err) {
      setMsg({ ok: false, text: err.message });
    } finally {
      setBusy(false);
    }
  };

  if (!portfolio) return null;

  const triggerHelp = {
    limit: buying ? `${side === 'buy' ? 'Buys' : 'Covers'} when price falls to or below this level.` : `${side === 'sell' ? 'Sells' : 'Shorts'} when price rises to or above this level.`,
    stop: buying
      ? `${side === 'buy' ? 'Buys' : 'Covers'} when price rises to or above this level${side === 'cover' ? ' (protects a short).' : ' (breakout entry).'}`
      : `${side === 'sell' ? 'Sells' : 'Shorts'} when price falls to or below this level${side === 'sell' ? ' (stop-loss).' : '.'}`,
  };
  const sideHelp = {
    short: 'Shorting sells borrowed shares. You profit if the price falls and lose if it rises (with no upper limit). Requires 50% margin.',
    cover: 'Covering buys back shares you shorted, closing the short position.',
  };

  return (
    <form className="card ticket" onSubmit={submit}>
      <h3>Trade {quote.symbol}</h3>
      <div className="seg full">
        {['buy', 'sell', 'short', 'cover'].map((s) => (
          <button key={s} type="button" className={side === s ? `on ${s === 'buy' || s === 'cover' ? 'buy' : 'sell'}` : ''} onClick={() => setSide(s)}>
            {s[0].toUpperCase() + s.slice(1)}
          </button>
        ))}
      </div>
      {sideHelp[side] && <p className="hint">{sideHelp[side]}</p>}
      <label>
        Order type
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="market">Market</option>
          <option value="limit">Limit</option>
          <option value="stop">Stop</option>
        </select>
      </label>
      {type !== 'market' && (
        <label>
          {type === 'limit' ? 'Limit price' : 'Stop price'}
          <input type="number" step="any" min="0" required value={trigger} placeholder={quote.price.toFixed(2)} onChange={(e) => setTrigger(e.target.value)} />
          <span className="hint">{triggerHelp[type]}</span>
        </label>
      )}
      <label>
        <span className="row between">
          Amount
          <span className="seg tiny">
            <button type="button" className={mode === 'shares' ? 'on' : ''} onClick={() => setMode('shares')}>
              Shares
            </button>
            <button type="button" className={mode === 'dollars' ? 'on' : ''} onClick={() => setMode('dollars')}>
              Dollars
            </button>
          </span>
        </span>
        <input type="number" step="any" min="0" required value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={mode === 'shares' ? '0' : '$0.00'} />
      </label>
      <div className="quick">
        {side === 'sell' && held > 0 && (
          <button type="button" className="ghost small" onClick={() => (setMode('shares'), setAmount(String(held)))}>
            Sell all ({qty(held)})
          </button>
        )}
        {side === 'cover' && held < 0 && (
          <button type="button" className="ghost small" onClick={() => (setMode('shares'), setAmount(String(-held)))}>
            Cover all ({qty(-held)})
          </button>
        )}
        {(side === 'buy' || side === 'short') && buyingPower > 0 && (
          <button
            type="button"
            className="ghost small"
            onClick={() => (setMode('dollars'), setAmount(String(Math.floor((side === 'short' ? buyingPower * 2 : buyingPower) * 100) / 100)))}
          >
            Max ({money(side === 'short' ? buyingPower * 2 : buyingPower)})
          </button>
        )}
      </div>
      <dl className="summary">
        <dt>{mode === 'shares' ? 'Estimated cost' : 'Estimated shares'}</dt>
        <dd>{mode === 'shares' ? money(estimate) : qty(Math.floor(shares * 1e4) / 1e4)}</dd>
        <dt>Buying power</dt>
        <dd>{money(buyingPower)}</dd>
        <dt>{held < 0 ? 'You are short' : 'You own'}</dt>
        <dd>{qty(Math.abs(held))} shares</dd>
        {portfolio.commission > 0 && (
          <>
            <dt>Commission</dt>
            <dd>{money(portfolio.commission)}</dd>
          </>
        )}
      </dl>
      {!quote.marketOpen && type === 'market' && <p className="hint">Market is closed, so market orders fill at the last price.</p>}
      <button className={`primary ${buying ? 'buy' : 'sell'}`} disabled={busy || !(Number(amount) > 0)}>
        {busy ? 'Placing…' : `${type === 'market' ? '' : `Place ${type} `}${side[0].toUpperCase() + side.slice(1)}`}
      </button>
      {msg && <p className={msg.ok ? 'success' : 'error'}>{msg.text}</p>}
      <p className="muted small">Trading in “{portfolio.name}”</p>
    </form>
  );
}
