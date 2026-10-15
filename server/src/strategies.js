// Strategy definitions. A strategy's `decide` runs once per completed bar and returns
// a trade intent ({ side: 'buy', dollars? } / { side: 'sell', qty? }) or null to hold.
// The same code drives both live bots and backtests (see engine.js).

import { sma, rsi, highestBefore, lowestBefore } from './indicators.js';

// Risk/sizing params shared by every strategy, applied by the engine.
export const COMMON_PARAMS = [
  { key: 'allocationPct', label: 'Cash allocated per buy (%)', default: 100, min: 1, max: 100 },
  { key: 'stopLossPct', label: 'Stop-loss (%, 0 = off)', default: 0, min: 0, max: 99 },
  { key: 'takeProfitPct', label: 'Take-profit (%, 0 = off)', default: 0, min: 0 },
];

export const STRATEGIES = {
  dca: {
    id: 'dca',
    name: 'Dollar-Cost Averaging',
    description: 'Buys a fixed dollar amount every N bars regardless of price. Never sells on its own.',
    params: [
      { key: 'amount', label: 'Amount per buy ($)', default: 500, min: 1 },
      { key: 'everyBars', label: 'Buy every N bars', default: 5, min: 1, step: 1 },
    ],
    usesAllocation: false,
    decide({ params, state }) {
      state.barCount = (state.barCount ?? 0) + 1;
      if ((state.barCount - 1) % Math.max(1, Math.round(params.everyBars)) !== 0) return null;
      return { side: 'buy', dollars: params.amount, reason: `Scheduled buy of $${params.amount}` };
    },
  },

  smaCrossover: {
    id: 'smaCrossover',
    name: 'Moving Average Crossover',
    description:
      'Trend following: buys when the fast SMA crosses above the slow SMA ("golden cross") and sells when it crosses back below.',
    params: [
      { key: 'fast', label: 'Fast SMA period', default: 10, min: 2, step: 1 },
      { key: 'slow', label: 'Slow SMA period', default: 30, min: 3, step: 1 },
    ],
    usesAllocation: true,
    decide({ closes, position, params }) {
      const fast = sma(closes, params.fast);
      const slow = sma(closes, params.slow);
      const n = closes.length - 1;
      if (n < 1 || slow[n - 1] == null) return null;
      const crossedUp = fast[n - 1] <= slow[n - 1] && fast[n] > slow[n];
      const crossedDown = fast[n - 1] >= slow[n - 1] && fast[n] < slow[n];
      if (crossedUp && position.qty === 0) {
        return { side: 'buy', reason: `SMA${params.fast} crossed above SMA${params.slow}` };
      }
      if (crossedDown && position.qty > 0) {
        return { side: 'sell', reason: `SMA${params.fast} crossed below SMA${params.slow}` };
      }
      return null;
    },
  },

  rsiReversion: {
    id: 'rsiReversion',
    name: 'RSI Mean Reversion',
    description: 'Buys when RSI falls below the oversold level and sells when it rises above the overbought level.',
    params: [
      { key: 'period', label: 'RSI period', default: 14, min: 2, step: 1 },
      { key: 'oversold', label: 'Oversold (buy below)', default: 30, min: 1, max: 99 },
      { key: 'overbought', label: 'Overbought (sell above)', default: 70, min: 1, max: 99 },
    ],
    usesAllocation: true,
    decide({ closes, position, params }) {
      const value = rsi(closes, params.period).at(-1);
      if (value == null) return null;
      if (value < params.oversold && position.qty === 0) {
        return { side: 'buy', reason: `RSI ${value.toFixed(1)} < ${params.oversold}` };
      }
      if (value > params.overbought && position.qty > 0) {
        return { side: 'sell', reason: `RSI ${value.toFixed(1)} > ${params.overbought}` };
      }
      return null;
    },
  },

  breakout: {
    id: 'breakout',
    name: 'Channel Breakout',
    description:
      'Momentum (Donchian/"turtle" style): buys when price closes above the highest high of the last N bars and exits below the lowest low of the last M bars.',
    params: [
      { key: 'entryBars', label: 'Entry lookback (bars)', default: 20, min: 2, step: 1 },
      { key: 'exitBars', label: 'Exit lookback (bars)', default: 10, min: 2, step: 1 },
    ],
    usesAllocation: true,
    decide({ candles, position, params }) {
      const close = candles.at(-1).close;
      if (position.qty === 0) {
        const high = highestBefore(candles.map((c) => c.high), params.entryBars);
        if (high != null && close > high) {
          return { side: 'buy', reason: `Close ${close.toFixed(2)} broke ${params.entryBars}-bar high ${high.toFixed(2)}` };
        }
      } else {
        const low = lowestBefore(candles.map((c) => c.low), params.exitBars);
        if (low != null && close < low) {
          return { side: 'sell', reason: `Close ${close.toFixed(2)} broke ${params.exitBars}-bar low ${low.toFixed(2)}` };
        }
      }
      return null;
    },
  },
};

export function listStrategies() {
  return Object.values(STRATEGIES).map(({ decide, ...def }) => ({
    ...def,
    params: [...def.params, ...COMMON_PARAMS.filter((p) => def.usesAllocation || p.key !== 'allocationPct')],
  }));
}

// Fill in defaults, coerce to numbers and validate ranges.
export function resolveParams(strategyId, input = {}) {
  const strategy = STRATEGIES[strategyId];
  if (!strategy) throw Object.assign(new Error(`Unknown strategy "${strategyId}"`), { status: 400 });
  const params = {};
  for (const p of [...strategy.params, ...COMMON_PARAMS]) {
    const raw = input[p.key];
    const value = raw === undefined || raw === '' || raw === null ? p.default : Number(raw);
    if (!Number.isFinite(value)) throw Object.assign(new Error(`${p.label} must be a number`), { status: 400 });
    if (p.min != null && value < p.min) throw Object.assign(new Error(`${p.label} must be at least ${p.min}`), { status: 400 });
    if (p.max != null && value > p.max) throw Object.assign(new Error(`${p.label} must be at most ${p.max}`), { status: 400 });
    params[p.key] = value;
  }
  if (strategyId === 'smaCrossover' && params.fast >= params.slow) {
    throw Object.assign(new Error('Fast SMA period must be shorter than slow period'), { status: 400 });
  }
  if (strategyId === 'rsiReversion' && params.oversold >= params.overbought) {
    throw Object.assign(new Error('Oversold level must be below overbought level'), { status: 400 });
  }
  return params;
}
