// The building blocks users compose into conditions. Each metric is evaluated
// for one stock at one bar index of its candle history.
//
// ctx = {
//   candles, end,                 // history (oldest first) and the bar being evaluated
//   barsPerYear,                  // used to annualize volatility
//   fundamentals,                 // { marketCap, pe, dividendYield, dayChangePct } (may be partial)
//   position: { qty, avgCost, openedAt },  // the bot's position in this stock (qty < 0 = short)
//   lastTradeTime,                // unix seconds of the bot's last trade in this stock, or null
// }

import { smaAt, emaAt, rsiAt, highestBefore, lowestBefore, returnStdevAt, atrAt } from '../indicators.js';

const period = (def, max = 500) => ({ key: 'period', label: 'Bars', default: def, min: 1, max });
const closeAt = (ctx, end) => ctx.candles[end].close;
const NEVER = 1e9; // "bars since" when something never happened

// Trading-day key (US Eastern, ignoring DST) so intraday bars can find yesterday's close.
const dayKey = (time) => Math.floor((time - 5 * 3600) / 86400);

function barsSince(ctx, end, time) {
  if (time == null) return NEVER;
  let n = 0;
  for (let i = end; i >= 0 && ctx.candles[i].time > time; i--) n++;
  return n;
}

export const METRICS = {
  // ---- Price & trend --------------------------------------------------------
  price: {
    label: 'Price',
    group: 'Price & trend',
    unit: '$',
    params: [],
    description: 'The latest price (the live price for bots, the bar close in backtests).',
    fn: (ctx, end) => closeAt(ctx, end),
  },
  change_pct: {
    label: 'Change %',
    group: 'Price & trend',
    unit: '%',
    params: [period(5)],
    description: 'Percent price change over the last N bars. Example: Change %(5) > 10 means up more than 10% over 5 bars.',
    fn: (ctx, end, p) => (end - p.period < 0 ? null : (closeAt(ctx, end) / closeAt(ctx, end - p.period) - 1) * 100),
  },
  day_change_pct: {
    label: "Today's change %",
    group: 'Price & trend',
    unit: '%',
    params: [],
    description: "Percent change since the previous trading day's close.",
    fn: (ctx, end) => {
      if (end === ctx.candles.length - 1 && ctx.fundamentals?.dayChangePct != null) return ctx.fundamentals.dayChangePct;
      const today = dayKey(ctx.candles[end].time);
      for (let i = end - 1; i >= 0; i--) {
        if (dayKey(ctx.candles[i].time) !== today) return (closeAt(ctx, end) / ctx.candles[i].close - 1) * 100;
      }
      return null;
    },
  },
  sma: {
    label: 'Simple moving average',
    short: 'SMA',
    group: 'Price & trend',
    unit: '$',
    params: [period(20)],
    description: 'Average closing price over the last N bars. Price above its SMA suggests an uptrend.',
    fn: (ctx, end, p) => smaAt(ctx.candles, end, p.period),
  },
  ema: {
    label: 'Exponential moving average',
    short: 'EMA',
    group: 'Price & trend',
    unit: '$',
    params: [period(20)],
    description: 'Like the SMA but weights recent bars more, so it reacts faster to new moves.',
    fn: (ctx, end, p) => emaAt(ctx.candles, end, p.period),
  },
  high_n: {
    label: 'N-bar high',
    group: 'Price & trend',
    unit: '$',
    params: [period(20)],
    description: 'Highest price of the previous N bars (excluding the current one). Price above it is a breakout.',
    fn: (ctx, end, p) => highestBefore(ctx.candles, end, p.period),
  },
  low_n: {
    label: 'N-bar low',
    group: 'Price & trend',
    unit: '$',
    params: [period(20)],
    description: 'Lowest price of the previous N bars (excluding the current one). Price below it is a breakdown.',
    fn: (ctx, end, p) => lowestBefore(ctx.candles, end, p.period),
  },
  pct_from_high: {
    label: '% below N-bar high',
    group: 'Price & trend',
    unit: '%',
    params: [period(50)],
    description: 'How far price is below its highest point of the last N bars (0 = at the high, -20 = 20% below).',
    fn: (ctx, end, p) => {
      if (end - p.period + 1 < 0) return null;
      let max = -Infinity;
      for (let i = end - p.period + 1; i <= end; i++) max = Math.max(max, ctx.candles[i].high, ctx.candles[i].close);
      return (closeAt(ctx, end) / max - 1) * 100;
    },
  },
  price_vs_sma_pct: {
    label: '% above SMA',
    group: 'Price & trend',
    unit: '%',
    params: [period(50)],
    description: 'How far price is above (positive) or below (negative) its N-bar simple moving average.',
    fn: (ctx, end, p) => {
      const avg = smaAt(ctx.candles, end, p.period);
      return avg == null ? null : (closeAt(ctx, end) / avg - 1) * 100;
    },
  },

  // ---- Momentum & volatility -----------------------------------------------
  rsi: {
    label: 'RSI',
    short: 'RSI',
    group: 'Momentum & volatility',
    unit: '',
    params: [period(14, 100)],
    description:
      'Relative Strength Index, 0–100. Below 30 is traditionally "oversold" (fell fast), above 70 "overbought" (rose fast).',
    fn: (ctx, end, p) => rsiAt(ctx.candles, end, p.period),
  },
  volatility: {
    label: 'Volatility score',
    group: 'Momentum & volatility',
    unit: '%',
    params: [period(20)],
    description:
      'Annualized volatility: the standard deviation of bar-to-bar returns over N bars, scaled to a year. Broad index funds are often around 15%, large caps 20–40%, and speculative stocks 60% or more.',
    fn: (ctx, end, p) => {
      const sd = returnStdevAt(ctx.candles, end, p.period);
      return sd == null ? null : sd * Math.sqrt(ctx.barsPerYear) * 100;
    },
  },
  atr_pct: {
    label: 'Average true range %',
    group: 'Momentum & volatility',
    unit: '%',
    params: [period(14)],
    description: 'Average size of one bar\'s price range (including gaps) as a % of price. A per-bar measure of how much the stock moves.',
    fn: (ctx, end, p) => {
      const atr = atrAt(ctx.candles, end, p.period);
      return atr == null ? null : (atr / closeAt(ctx, end)) * 100;
    },
  },

  // ---- Volume ---------------------------------------------------------------
  volume: {
    label: 'Volume',
    group: 'Volume',
    unit: 'shares',
    params: [],
    description: 'Shares traded in the current bar (still accumulating while a bar is in progress).',
    fn: (ctx, end) => ctx.candles[end].volume,
  },
  avg_volume: {
    label: 'Average volume',
    group: 'Volume',
    unit: 'shares',
    params: [period(20)],
    description: 'Average shares traded per bar over the previous N completed bars. Useful to skip illiquid stocks.',
    fn: (ctx, end, p) => (end - p.period < 0 ? null : smaAt(ctx.candles, end - 1, p.period, (c) => c.volume)),
  },
  rel_volume: {
    label: 'Relative volume',
    group: 'Volume',
    unit: 'x',
    params: [period(20)],
    description: 'Current bar volume divided by the N-bar average. 2 means twice the usual activity.',
    fn: (ctx, end, p) => {
      const avg = end - p.period < 0 ? null : smaAt(ctx.candles, end - 1, p.period, (c) => c.volume);
      return avg ? ctx.candles[end].volume / avg : null;
    },
  },

  // ---- Fundamentals (screener sources only) ---------------------------------
  market_cap: {
    label: 'Market cap ($B)',
    group: 'Fundamentals (screener sources)',
    unit: '$B',
    params: [],
    description: 'Company size in billions of dollars. Only available for stocks that come from a screener.',
    fn: (ctx) => (ctx.fundamentals?.marketCap == null ? null : ctx.fundamentals.marketCap / 1e9),
  },
  pe: {
    label: 'P/E ratio',
    group: 'Fundamentals (screener sources)',
    unit: '',
    params: [],
    description: 'Price divided by trailing 12-month earnings. Only available for stocks that come from a screener.',
    fn: (ctx) => ctx.fundamentals?.pe ?? null,
  },
  dividend_yield: {
    label: 'Dividend yield %',
    group: 'Fundamentals (screener sources)',
    unit: '%',
    params: [],
    description: 'Annual dividend as a % of price. Only available for stocks that come from a screener.',
    fn: (ctx) => ctx.fundamentals?.dividendYield ?? null,
  },

  // ---- This bot's position ----------------------------------------------------
  position_qty: {
    label: "Bot's shares",
    group: "Bot's position",
    unit: 'shares',
    params: [],
    description: 'Shares this bot holds: positive = long, negative = short, 0 = no position. Use "= 0" to only enter when flat.',
    fn: (ctx) => ctx.position.qty,
  },
  position_pnl_pct: {
    label: 'Position profit %',
    group: "Bot's position",
    unit: '%',
    params: [],
    description: 'Unrealized gain/loss on the bot\'s position vs. its average entry price (works for shorts too). Empty when flat.',
    fn: (ctx, end) => {
      const { qty, avgCost } = ctx.position;
      if (!qty || !avgCost) return null;
      const price = closeAt(ctx, end);
      return qty > 0 ? (price / avgCost - 1) * 100 : (avgCost / price - 1) * 100;
    },
  },
  bars_held: {
    label: 'Bars held',
    group: "Bot's position",
    unit: 'bars',
    params: [],
    description: 'How many bars since the bot opened its current position. Empty when flat. Good for time-based exits.',
    fn: (ctx, end) => (ctx.position.qty ? barsSince(ctx, end, ctx.position.openedAt) : null),
  },
  bars_since_trade: {
    label: 'Bars since last trade',
    group: "Bot's position",
    unit: 'bars',
    params: [],
    description: 'Bars since this bot last traded this stock (very large if never). Use it to act on a schedule, e.g. every 5 bars.',
    fn: (ctx, end) => barsSince(ctx, end, ctx.lastTradeTime),
  },
};

export const OPERATORS = {
  gt: { label: '>', test: (a, b) => a > b },
  gte: { label: '≥', test: (a, b) => a >= b },
  lt: { label: '<', test: (a, b) => a < b },
  lte: { label: '≤', test: (a, b) => a <= b },
  eq: { label: '=', test: (a, b) => Math.abs(a - b) < 1e-9 },
  neq: { label: '≠', test: (a, b) => Math.abs(a - b) >= 1e-9 },
  crosses_above: { label: 'crosses above', cross: true },
  crosses_below: { label: 'crosses below', cross: true },
};

export function operandLabel(operand) {
  if (operand.type === 'value') return String(operand.value);
  const m = METRICS[operand.metric];
  const name = m.short ?? m.label;
  return m.params.length ? `${name}(${operand.period})` : name;
}

export function formatValue(metricId, value) {
  if (value == null) return 'n/a';
  if (value >= NEVER) return 'never';
  const unit = metricId ? METRICS[metricId].unit : '';
  if (unit === '$') return `$${value.toFixed(2)}`;
  if (unit === '%') return `${value.toFixed(2)}%`;
  if (unit === '$B') return `$${value.toFixed(1)}B`;
  if (unit === 'shares') return Math.abs(value) >= 1e4 ? Math.round(value).toLocaleString('en-US') : String(+value.toFixed(4));
  if (unit === 'x') return `${value.toFixed(2)}x`;
  return String(+value.toFixed(2));
}

export function evaluateOperand(operand, ctx, end) {
  if (operand.type === 'value') return operand.value;
  if (end < 0) return null;
  return METRICS[operand.metric].fn(ctx, end, operand);
}

// Catalog for the UI (no functions).
export function metricCatalog() {
  return Object.entries(METRICS).map(([id, { fn, ...m }]) => ({ id, ...m }));
}
