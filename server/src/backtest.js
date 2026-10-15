// Replays a strategy over historical bars. Orders fill at the close of the bar that
// generated the signal.

import { runStep } from './engine.js';
import { applyFill, newPortfolioState, roundMoney } from './accounting.js';

export const BARS_PER_YEAR = { '1h': 252 * 7, '1d': 252, '1wk': 52 };

export function runBacktest({ candles, strategyId, params, startingCash = 10_000, commission = 0, interval = '1d' }) {
  if (!candles?.length) throw Object.assign(new Error('No historical data to backtest'), { status: 400 });

  const sym = 'X';
  const portfolio = newPortfolioState(startingCash);
  const state = {};
  const trades = [];
  const equity = [];
  const benchmark = [];
  const benchShares = startingCash / candles[0].close;

  for (let i = 0; i < candles.length; i++) {
    const bar = candles[i];
    const position = portfolio.positions[sym] ?? { qty: 0, avgCost: 0 };
    const intent = runStep({
      strategyId,
      params,
      state,
      candles: candles.slice(0, i + 1),
      price: bar.close,
      position: { ...position },
      cash: portfolio.cash,
      commission,
    });
    if (intent) {
      const fill = applyFill(portfolio, { symbol: sym, side: intent.side, qty: intent.qty, price: bar.close, commission });
      trades.push({
        time: bar.time,
        side: intent.side,
        qty: intent.qty,
        price: bar.close,
        realizedPnl: fill.realizedPnl,
        reason: intent.reason,
      });
    }
    const held = portfolio.positions[sym]?.qty ?? 0;
    equity.push({ time: bar.time, value: roundMoney(portfolio.cash + held * bar.close) });
    benchmark.push({ time: bar.time, value: roundMoney(benchShares * bar.close) });
  }

  return {
    trades,
    equity,
    benchmark,
    metrics: computeMetrics({ equity, benchmark, trades, startingCash, interval }),
    finalPosition: portfolio.positions[sym]?.qty ?? 0,
  };
}

export function computeMetrics({ equity, benchmark, trades, startingCash, interval = '1d' }) {
  const finalValue = equity.at(-1).value;
  const totalReturnPct = (finalValue / startingCash - 1) * 100;
  const benchmarkReturnPct = (benchmark.at(-1).value / startingCash - 1) * 100;

  let peak = -Infinity;
  let maxDrawdownPct = 0;
  for (const { value } of equity) {
    peak = Math.max(peak, value);
    maxDrawdownPct = Math.min(maxDrawdownPct, (value / peak - 1) * 100);
  }

  const returns = [];
  for (let i = 1; i < equity.length; i++) returns.push(equity[i].value / equity[i - 1].value - 1);
  const mean = returns.reduce((a, b) => a + b, 0) / (returns.length || 1);
  const variance = returns.reduce((a, r) => a + (r - mean) ** 2, 0) / (returns.length || 1);
  const std = Math.sqrt(variance);
  const barsPerYear = BARS_PER_YEAR[interval] ?? 252;
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(barsPerYear) : 0;

  const years = (equity.at(-1).time - equity[0].time) / (365.25 * 86400);
  const cagrPct = years > 0 ? ((finalValue / startingCash) ** (1 / years) - 1) * 100 : 0;

  const closed = trades.filter((t) => t.side === 'sell');
  const wins = closed.filter((t) => t.realizedPnl > 0).length;

  return {
    startingCash,
    finalValue,
    totalReturnPct,
    benchmarkReturnPct,
    cagrPct,
    maxDrawdownPct,
    sharpe,
    tradeCount: trades.length,
    closedTrades: closed.length,
    winRatePct: closed.length ? (wins / closed.length) * 100 : null,
  };
}
